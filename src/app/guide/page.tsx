import Link from "next/link";
import { TUTORIAL_STEPS } from "@/lib/tutorial-steps";

export const metadata = {
  title: "Guide — JEE Study App",
  description: "A readable guide to every feature in the JEE Study App.",
};

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16">
        <div className="mb-10">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            ← Back to app
          </Link>
          <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
            JEE Study App — Guide
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Everything the app does, in the order you should set it up. Skim once, then use it as a reference.
          </p>
        </div>

        <ol className="space-y-8">
          {TUTORIAL_STEPS.map((step, i) => (
            <li key={step.id} className="border-l-2 border-border pl-5">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-mono text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="text-lg font-semibold">{step.title}</h2>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{step.body}</p>
              {step.fallbackHint && (
                <p className="mt-2 text-xs text-muted-foreground italic">{step.fallbackHint}</p>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-12 pt-8 border-t border-border text-xs text-muted-foreground">
          <p>
            All data is stored locally in your browser (IndexedDB). Export a backup from the Data tab weekly.
            Scoring follows the NTA scheme: +4 correct, −1 wrong, 0 unattempted — for both MCQ and numerical questions.
          </p>
        </div>
      </div>
    </main>
  );
}
