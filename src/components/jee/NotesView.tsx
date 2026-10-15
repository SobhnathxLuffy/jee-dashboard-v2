"use client";

// ─── Aspirant Notes & Formula Notebook ─────────────────────────────────────
// Quick jotting for tricky formulas, recurring traps, organic reactions,
// and exam strategy. Filterable by Subject, Chapter, and Tags.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { NavController } from "./App";
import { EmptyNote, PageTitle, SectionCard, SubjectDot } from "./shared";
import { useLive, put, del } from "@/lib/idb";
import { SUBJECTS, uid, type NoteRecord, type Subject } from "@/lib/types";
import { Bookmark, Copy, Edit2, Pin, Plus, Search, Trash2 } from "lucide-react";

const COMMON_TAGS = [
  "formula",
  "trap",
  "silly-mistake",
  "reaction",
  "shortcut",
  "quick-revision",
  "modern-physics",
  "organic",
  "calculus",
] as const;

export function NotesView({ nav }: { nav: NavController }) {
  const notes = useLive("notes");
  const syllabus = useLive("syllabus");

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [subject, setSubject] = useState<Subject | "General">("General");
  const [chapter, setChapter] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");

  const chaptersForSubject = useMemo(() => {
    if (subject === "General") return [];
    return syllabus
      .filter((s) => s.subject === subject)
      .map((s) => s.chapter)
      .sort();
  }, [syllabus, subject]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      for (const t of n.tags) {
        if (t.trim()) set.add(t.trim().toLowerCase());
      }
    }
    return Array.from(set).sort();
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (filterSubject !== "all") {
          if (filterSubject === "General" && n.subject !== "General") return false;
          if (filterSubject !== "General" && n.subject !== filterSubject) return false;
        }
        if (filterTag !== "all") {
          const hasTag = n.tags.some((t) => t.toLowerCase() === filterTag.toLowerCase());
          if (!hasTag) return false;
        }
        if (q) {
          const matchTitle = n.title.toLowerCase().includes(q);
          const matchContent = n.content.toLowerCase().includes(q);
          const matchChapter = n.chapter?.toLowerCase().includes(q);
          const matchTags = n.tags.some((t) => t.toLowerCase().includes(q));
          return matchTitle || matchContent || matchChapter || matchTags;
        }
        return true;
      })
      .sort((a, b) => {
        // Pinned first, then latest
        if (Boolean(a.pinned) !== Boolean(b.pinned)) {
          return a.pinned ? -1 : 1;
        }
        return (b.updated_at || b.created_at) - (a.updated_at || a.created_at);
      });
  }, [notes, search, filterSubject, filterTag]);

  function resetForm() {
    setTitle("");
    setContent("");
    setSubject("General");
    setChapter("");
    setTagsInput("");
    setPinned(false);
    setEditingId(null);
  }

  function startEdit(note: NoteRecord) {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setSubject(note.subject ?? "General");
    setChapter(note.chapter ?? "");
    setTagsInput(note.tags.join(", "));
    setPinned(Boolean(note.pinned));
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addTag(tag: string) {
    const cur = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!cur.includes(tag)) {
      setTagsInput([...cur, tag].join(", "));
    }
  }

  async function saveNote() {
    if (!title.trim()) {
      toast.error("Note title is required");
      return;
    }
    if (!content.trim()) {
      toast.error("Note content cannot be empty");
      return;
    }

    const tags = tagsInput
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean);

    setSaving(true);
    try {
      const now = Date.now();
      if (editingId) {
        const existing = notes.find((n) => n.id === editingId);
        if (!existing) {
          toast.error("Note no longer exists");
          resetForm();
          return;
        }
        const updated: NoteRecord = {
          ...existing,
          title: title.trim(),
          content: content.trim(),
          subject: subject === "General" ? "General" : subject,
          chapter: chapter.trim() || undefined,
          tags,
          pinned,
          updated_at: now,
        };
        await put("notes", updated);
        toast.success("Note updated");
      } else {
        const newNote: NoteRecord = {
          id: uid(),
          title: title.trim(),
          content: content.trim(),
          subject: subject === "General" ? "General" : subject,
          chapter: chapter.trim() || undefined,
          tags,
          pinned,
          created_at: now,
          updated_at: now,
        };
        await put("notes", newNote);
        toast.success("Note saved");
      }
      resetForm();
      setFormOpen(false);
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  async function togglePin(note: NoteRecord) {
    try {
      await put("notes", {
        ...note,
        pinned: !note.pinned,
        updated_at: Date.now(),
      });
      toast.success(note.pinned ? "Unpinned" : "Pinned to top");
    } catch {
      toast.error("Could not update pin status");
    }
  }

  async function deleteNote(id: string) {
    try {
      await del("notes", id);
      if (editingId === id) resetForm();
      toast.success("Note deleted");
    } catch {
      toast.error("Could not delete note");
    }
  }

  function copyNote(note: NoteRecord) {
    const text = `${note.title}\n${note.subject ? `[${note.subject}${note.chapter ? ` - ${note.chapter}` : ""}]\n` : ""}\n${note.content}\n${note.tags.length > 0 ? `\nTags: #${note.tags.join(" #")}` : ""}`;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Could not copy"));
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Study Notebook"
        subtitle="Formulas, trick notes, common traps, and key reactions with tags for quick revision."
        right={
          <div className="flex items-center gap-2">
            <Button
              variant={formOpen ? "secondary" : "default"}
              size="sm"
              onClick={() => {
                if (formOpen && editingId) resetForm();
                setFormOpen((v) => !v);
              }}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              {formOpen ? "Close Editor" : "New Note"}
            </Button>
            <Badge variant="outline" className="border-border text-muted-foreground">
              {notes.length} notes
            </Badge>
          </div>
        }
      />

      {formOpen ? (
        <SectionCard
          title={editingId ? "Edit Note" : "Create New Note"}
          subtitle="Support for formulas, pitfalls, and chapter-specific notes."
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetForm();
                setFormOpen(false);
              }}
            >
              Cancel
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Title / Concept</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Standard Reduction Potential & Sign Traps"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Subject</Label>
                <Select
                  value={subject}
                  onValueChange={(v) => {
                    setSubject(v as Subject | "General");
                    setChapter("");
                  }}
                >
                  <SelectTrigger aria-label="Subject">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General / Strategy</SelectItem>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {subject !== "General" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Chapter (optional)</Label>
                <Select value={chapter} onValueChange={setChapter}>
                  <SelectTrigger aria-label="Chapter">
                    <SelectValue placeholder="Pick a chapter (optional)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="none">-- None / General Subject --</SelectItem>
                    {chaptersForSubject.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label className="text-xs">Note / Formula / Insight</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                placeholder="Write your formula, shortcut, explanation, or mistake trap here..."
                className="font-mono text-sm leading-relaxed"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Tags (comma or space separated)</Label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">Quick add:</span>
                  {COMMON_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addTag(tag)}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. formula, trap, electrochemistry, revision"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                />
                Pin this note to the top
              </label>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setFormOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={saveNote}
                  disabled={saving}
                  className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950"
                >
                  {saving ? "Saving..." : editingId ? "Update Note" : "Save Note"}
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {/* Filter and search bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes, formulas, tags..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-36 text-xs" aria-label="Filter Subject">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              <SelectItem value="General">General</SelectItem>
              {SUBJECTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {allTags.length > 0 ? (
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="w-36 text-xs" aria-label="Filter Tag">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {allTags.map((t) => (
                  <SelectItem key={t} value={t}>
                    #{t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      {/* Active tag chips */}
      {allTags.length > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground/70 mr-1">Tags:</span>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setFilterTag(filterTag === t ? "all" : t)}
              className={cn(
                "text-xs px-2 py-0.5 rounded-full border transition-colors",
                filterTag === t
                  ? "bg-emerald-600 text-white border-emerald-600 font-medium"
                  : "bg-card text-muted-foreground border-border hover:border-emerald-500 hover:text-foreground"
              )}
            >
              #{t}
            </button>
          ))}
          {filterTag !== "all" ? (
            <button
              onClick={() => setFilterTag("all")}
              className="text-[10px] text-muted-foreground underline hover:text-foreground ml-1"
            >
              Clear tag filter
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <EmptyNote>
          {notes.length === 0
            ? "No notes yet. Click 'New Note' to write down essential formulas, tricky exceptions, or mistake takeaways."
            : "No notes match your search or filter."}
        </EmptyNote>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              className={cn(
                "rounded-xl border bg-card p-4 flex flex-col justify-between transition-shadow hover:shadow-md",
                note.pinned
                  ? "border-amber-400/80 bg-amber-50/20 dark:bg-amber-950/10 shadow-sm"
                  : "border-border"
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">
                      {note.title}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {note.subject && note.subject !== "General" ? (
                        <div className="flex items-center gap-1">
                          <SubjectDot subject={note.subject} />
                          <span className="text-[11px] text-muted-foreground font-medium">
                            {note.subject}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground font-medium">
                          General
                        </span>
                      )}
                      {note.chapter ? (
                        <span className="text-[11px] text-muted-foreground/80 truncate max-w-[140px]">
                          • {note.chapter}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => togglePin(note)}
                    title={note.pinned ? "Unpin note" : "Pin note to top"}
                    className={cn(
                      "p-1 rounded hover:bg-muted transition-colors shrink-0",
                      note.pinned
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground/40 hover:text-muted-foreground"
                    )}
                  >
                    <Pin className="h-4 w-4" />
                  </button>
                </div>

                <div className="text-xs text-foreground/90 whitespace-pre-wrap font-sans leading-relaxed my-3 bg-muted/30 p-2.5 rounded-lg border border-border/50 max-h-56 overflow-y-auto">
                  {note.content}
                </div>

                {note.tags && note.tags.length > 0 ? (
                  <div className="flex items-center gap-1 flex-wrap mt-2">
                    {note.tags.map((t) => (
                      <span
                        key={t}
                        onClick={() => setFilterTag(t)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground hover:text-foreground cursor-pointer hover:bg-muted transition-colors"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between border-t border-border/60 pt-3 mt-3 text-xs text-muted-foreground/70">
                <span>
                  {new Date(note.updated_at || note.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => copyNote(note)}
                    title="Copy note"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => startEdit(note)}
                    title="Edit note"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                        title="Delete note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                        <AlertDialogDescription>
                          &ldquo;{note.title}&rdquo; will be deleted permanently.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => deleteNote(note.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
