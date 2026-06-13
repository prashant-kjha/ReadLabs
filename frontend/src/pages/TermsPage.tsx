import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const CONTACT_EMAIL = "legal@readlabs.org";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="border-b border-border bg-surface">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-baseline gap-1.5 select-none">
            <span className="inline-block w-2.5 h-2.5 bg-accent rounded-[1px]" aria-hidden="true" />
            <span className="font-display font-bold text-lg leading-none text-[var(--color-text)]">ReadLabs</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-text-secondary)] hover:text-accent transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 prose-readlabs">
        <p className="label-mono text-accent">The Fine Print</p>
        <h1 className="mt-2 font-display text-3xl font-semibold mb-2">Terms of Service</h1>
        <p className="font-mono text-xs text-[var(--color-text-secondary)] mb-10 border-b border-[var(--color-border-strong)] pb-6">
          Last updated: {new Date().toISOString().slice(0, 10)}
        </p>

        <Section title="1. What ReadLabs is">
          <p>
            ReadLabs is an AI-assisted research-paper reading tool for teachers and their
            students. Teachers upload PDFs and create reading assignments; students read
            with AI-generated guidance, checkpoints, jargon lookups, and quizzes.
            ReadLabs is provided as-is, with no warranty.
          </p>
        </Section>

        <Section title="2. Accounts and roles">
          <p>
            You must register an account to use ReadLabs. Teachers may create classes and
            upload papers; students may join classes via a class code shared by the
            teacher. You are responsible for keeping your credentials secure and for any
            activity under your account.
          </p>
        </Section>

        <Section title="3. Uploaded content and copyright">
          <p>
            <strong>Teachers</strong> are solely responsible for ensuring they hold the
            rights necessary to upload and share any PDF with their students. By
            uploading, you confirm one of the following applies:
          </p>
          <ul>
            <li>You authored the paper or hold the copyright.</li>
            <li>The paper is open-access under a license that permits classroom redistribution.</li>
            <li>
              Your use falls within an applicable classroom-use exemption — for example
              U.S. fair use or the TEACH Act — and access on ReadLabs is restricted to
              students enrolled in your class for the duration of the course.
            </li>
          </ul>
          <p>
            ReadLabs does <strong>not</strong> make uploaded PDFs publicly searchable or
            indexable. Each PDF is served via short-lived signed URLs only to
            authenticated users with an active enrollment or session that grants access.
          </p>
        </Section>

        <Section title="4. Copyright takedown (DMCA-style notices)">
          <p>
            If you believe content on ReadLabs infringes your copyright, send a written
            notice to{" "}
            <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{" "}
            including:
          </p>
          <ul>
            <li>Identification of the copyrighted work.</li>
            <li>The URL or paper title in ReadLabs that contains the material.</li>
            <li>Your contact information.</li>
            <li>
              A statement, under penalty of perjury, that you are the rights holder or
              authorized to act on the rights holder&apos;s behalf, and that the use is
              not authorized.
            </li>
            <li>Your physical or electronic signature.</li>
          </ul>
          <p>
            We will review valid notices and remove infringing content promptly. Repeat
            infringers may have their accounts terminated.
          </p>
        </Section>

        <Section title="5. Student privacy">
          <p>
            We collect the minimum data needed to run the product: name, email,
            class-enrollment records, reading progress, AI-generated feedback, and quiz
            responses. We do not sell student data. Teachers can see their own students&apos;
            progress and responses inside their own classes only. We do not knowingly
            collect data from children under 13.
          </p>
        </Section>

        <Section title="6. Data retention and deletion">
          <p>
            Uploaded PDFs and associated student data may be deleted automatically once
            an assignment has been inactive for an extended period (currently 90 days
            after the last activity). You may request deletion of your account and
            associated data at any time by emailing{" "}
            <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section title="7. Acceptable use">
          <p>You agree not to:</p>
          <ul>
            <li>Upload PDFs you do not have the right to share.</li>
            <li>Attempt to access another user&apos;s account, class, or content.</li>
            <li>Probe, scan, or attack the service or its infrastructure.</li>
            <li>Use the service to harass, defame, or violate the rights of others.</li>
          </ul>
        </Section>

        <Section title="8. AI-generated content">
          <p>
            Reading guides, feedback, jargon lookups, and quiz items are generated by AI
            and may contain errors. They are an aid to learning, not a substitute for
            careful reading or instructor judgment. We make no guarantee of accuracy.
          </p>
        </Section>

        <Section title="9. Changes to these terms">
          <p>
            We may update these terms over time. Material changes will be communicated
            via the product or via the email address on your account.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            Questions, takedown notices, deletion requests, or anything else:{" "}
            <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </main>

      <footer className="border-t border-border py-6 mt-8 bg-surface">
        <div className="max-w-3xl mx-auto px-6 font-mono text-xs text-[var(--color-text-secondary)] text-center">
          &copy; {new Date().getFullYear()} ReadLabs
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 border-t border-dotted border-border pt-6 first:border-t-0 first:pt-0">
      <h2 className="font-display text-xl font-semibold mb-3">{title}</h2>
      <div className="space-y-3 text-[var(--color-text-secondary)] leading-relaxed [&_a]:break-all [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}
