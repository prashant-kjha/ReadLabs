import { useState, useEffect, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Sparkles,
  BookOpen,
  Compass,
  HelpCircle,
  Flame,
  ArrowRight,
  MessageSquare,
  Search,
  BrainCircuit,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

function Wordmark({ size = 'base' }: { size?: 'base' | 'lg' }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 select-none">
      <span className="inline-block w-2.5 h-2.5 bg-accent rounded-[1px]" aria-hidden="true" />
      <span className={`font-display font-bold leading-none text-[var(--color-text)] ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}>ReadLabs</span>
    </span>
  );
}

/* Section header in the scholarly register: mono folio + serif title */
function SectionHeader({
  folio,
  title,
  lede,
}: {
  folio: string;
  title: ReactNode;
  lede?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="label-mono text-accent">{folio}</p>
      <h2 className="mt-3 font-display text-3xl md:text-4xl font-semibold leading-tight">
        {title}
      </h2>
      {lede && (
        <p className="mt-4 text-[var(--color-text-secondary)] leading-relaxed">{lede}</p>
      )}
    </div>
  );
}

/* The hero artifact: a research paper rendered as an annotated manuscript */
function AnnotatedManuscript() {
  return (
    <div className="relative">
      {/* Backdrop sheet, slightly rotated, like a stack of paper */}
      <div
        className="absolute inset-0 translate-x-3 translate-y-3 rotate-[0.8deg] rounded-sm border border-border bg-muted"
        aria-hidden="true"
      />
      {/* The manuscript itself */}
      <div className="relative card-print p-0 overflow-hidden">
        {/* Running head */}
        <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-secondary)]">
            J. Neuro. Biol. · Vol 42
          </span>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-accent">
            Section 1 of 4
          </span>
        </div>

        <div className="grid grid-cols-[1fr_148px]">
          {/* Paper body */}
          <div className="p-5 pr-4 border-r border-dashed border-border">
            <p className="font-display font-semibold text-sm leading-snug">
              Neural Mechanisms of Memory Consolidation During Sleep
            </p>
            <p className="mt-1 font-mono text-[9px] text-[var(--color-text-secondary)]">
              Chen, R., Okafor, M., et al. (2025)
            </p>

            {/* Abstract lines, one highlighted by the AI */}
            <div className="mt-4 space-y-2" aria-hidden="true">
              <div className="h-1.5 rounded-full bg-muted w-full" />
              <div className="h-1.5 rounded-full bg-muted w-11/12" />
              <div className="relative">
                <div className="absolute -inset-x-1 -inset-y-1 bg-warning/20 rounded-sm" />
                <div className="relative h-1.5 rounded-full bg-muted-foreground/60 w-full" />
              </div>
              <div className="h-1.5 rounded-full bg-muted w-4/5" />
              <div className="h-1.5 rounded-full bg-muted w-full" />
              <div className="h-1.5 rounded-full bg-muted w-2/3" />
            </div>

            {/* AI checkpoint card */}
            <div className="mt-5 rounded-sm border border-primary/40 bg-primary/5 p-3">
              <p className="label-mono !text-[9px] text-primary">Checkpoint · AI</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-text)]">
                In your own words — why does the hippocampus &ldquo;replay&rdquo; memories during slow-wave sleep?
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-6 flex-1 rounded-sm border border-border bg-surface" />
                <span className="inline-flex items-center rounded-sm bg-primary px-2 py-1 font-mono text-[8px] font-semibold uppercase tracking-wider text-[var(--color-primary-foreground)]">
                  Submit
                </span>
              </div>
            </div>
          </div>

          {/* Marginalia column */}
          <div className="p-3 space-y-4 bg-surface">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">★ jargon</p>
              <p className="mt-1 text-[10px] leading-snug text-[var(--color-text-secondary)]">
                <span className="font-semibold text-[var(--color-text)]">consolidation</span> — how short-term memories become permanent
              </p>
            </div>
            <div className="border-t border-dotted border-border pt-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">¶ guide</p>
              <p className="mt-1 text-[10px] leading-snug text-[var(--color-text-secondary)]">
                Watch for the <em className="font-display">method</em> — what did they actually measure?
              </p>
            </div>
            <div className="border-t border-dotted border-border pt-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">✓ progress</p>
              <div className="mt-2 flex gap-1" aria-hidden="true">
                <span className="h-1 flex-1 rounded-full bg-primary" />
                <span className="h-1 flex-1 rounded-full bg-primary" />
                <span className="h-1 flex-1 rounded-full bg-muted" />
                <span className="h-1 flex-1 rounded-full bg-muted" />
              </div>
              <p className="mt-1.5 font-mono text-[9px] text-[var(--color-text-secondary)]">2/4 sections · +40 XP</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    Icon: Compass,
    title: 'Guided Reading',
    desc: 'Section-by-section guiding questions tell you what to look for before you read.',
  },
  {
    Icon: MessageSquare,
    title: 'AI Checkpoints',
    desc: 'Write responses at each section and get instant AI feedback on your understanding.',
  },
  {
    Icon: Search,
    title: 'Jargon Lookup',
    desc: 'Look up any scientific term and get a plain-language explanation instantly.',
  },
  {
    Icon: HelpCircle,
    title: 'Comprehension Quizzes',
    desc: 'Multiple choice and short answer quizzes graded by AI after reading.',
  },
  {
    Icon: BrainCircuit,
    title: 'Critical Thinking',
    desc: 'Targeted prompts that push you to analyze, evaluate, and think deeper about each section.',
  },
  {
    Icon: Flame,
    title: 'Streaks & XP',
    desc: 'Earn XP for every section, checkpoint, and quiz. Build your reading streak.',
  },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToHow = (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* ── Masthead ── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-surface/95 backdrop-blur-sm border-b border-border shadow-card'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={() => navigate('/auth')}
              className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors px-3 py-2"
            >
              Login
            </button>
            <button onClick={() => navigate('/auth')} className="btn-primary text-sm">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-28 pb-20 lg:pt-36 lg:pb-28 overflow-hidden">
        {/* Ruled-paper baseline grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.35]"
          aria-hidden="true"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent, transparent 31px, var(--color-border) 31px, var(--color-border) 32px)',
            maskImage: 'linear-gradient(to bottom, black, transparent 75%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 75%)',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-6">
          {/* Kicker rule */}
          <div className="rule-ornament animate-rise-in">
            <span className="label-mono whitespace-nowrap">
              AI-Guided Reading · Classrooms &amp; Curious Minds
            </span>
          </div>

          <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6">
              <h1 className="font-display text-5xl md:text-6xl lg:text-[4.4rem] font-semibold leading-[1.02] tracking-tight animate-rise-in [animation-delay:80ms]">
                Read Research Papers{' '}
                <em className="text-accent font-medium">Like a Pro</em>
                <sup className="font-mono text-base text-[var(--color-text-secondary)] align-super ml-1">1</sup>
              </h1>
              <p className="mt-7 text-lg text-[var(--color-text-secondary)] max-w-xl leading-relaxed animate-rise-in [animation-delay:160ms]">
                AI-guided reading that breaks down complex research into
                interactive, section-by-section lessons — with checkpoints,
                quizzes, and real-time feedback built for students.
              </p>
              <div className="mt-9 flex flex-wrap gap-4 animate-rise-in [animation-delay:240ms]">
                <button onClick={() => navigate('/auth')} className="btn-accent flex items-center gap-2 px-7 py-3">
                  Get Started Free <ArrowRight className="w-4 h-4" />
                </button>
                <button onClick={scrollToHow} className="btn-outline flex items-center gap-2 px-7 py-3">
                  See How It Works
                </button>
              </div>
              {/* Footnote */}
              <p className="mt-12 font-mono text-xs text-[var(--color-text-secondary)] animate-rise-in [animation-delay:320ms]">
                <span className="text-accent">1.</span> No PhD required.
              </p>
            </div>

            <div className="hidden lg:block lg:col-span-6 animate-rise-in [animation-delay:200ms]">
              <AnnotatedManuscript />
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-6">
          <SectionHeader
            folio="§ 01 — The Method"
            title="How It Works"
            lede="Three simple steps to transform how you read research papers."
          />
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border">
            {[
              {
                num: '01',
                title: 'Upload a Paper',
                desc: 'Paste a URL or upload a PDF — our AI extracts every section in seconds.',
                Icon: Upload,
              },
              {
                num: '02',
                title: 'AI Generates Your Guide',
                desc: 'Guiding questions, checkpoints, and quizzes are created automatically for each section.',
                Icon: Sparkles,
              },
              {
                num: '03',
                title: 'Read Interactively',
                desc: 'Work through each section with AI prompts, submit checkpoints, and track your progress.',
                Icon: BookOpen,
              },
            ].map(({ num, title, desc, Icon }) => (
              <div key={num} className="group bg-surface p-8 transition-colors hover:bg-[var(--color-bg)]">
                <div className="flex items-start justify-between">
                  <span className="font-display text-5xl font-light text-[var(--color-muted-foreground)] transition-colors group-hover:text-accent">
                    {num}
                  </span>
                  <Icon className="w-5 h-5 text-primary mt-2" />
                </div>
                <h3 className="mt-8 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Index ── */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <SectionHeader
            folio="§ 02 — The Apparatus"
            title="Everything You Need to Read Smarter"
            lede="Powerful features designed to make research papers accessible to every student."
          />
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
            {FEATURES.map(({ Icon, title, desc }, i) => (
              <div
                key={title}
                className="group relative p-8 bg-[var(--color-bg)] transition-colors hover:bg-surface"
              >
                <div className="flex items-center justify-between">
                  <Icon className="w-5 h-5 text-accent" />
                  <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold group-hover:text-primary transition-colors">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Two Readers ── */}
      <section className="py-24 border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-6">
          <SectionHeader
            folio="§ 03 — The Readers"
            title="Built for Every Classroom"
            lede="Whether you are teaching or learning, ReadLabs has you covered."
          />
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Teachers */}
            <div className="card-print p-8">
              <p className="label-mono text-accent">For Teachers</p>
              <h3 className="mt-2 font-display text-2xl font-semibold">The Lectern</h3>
              <ul className="mt-6 space-y-4">
                {[
                  'Upload papers and assign them to your classes',
                  'Review student responses and reading progress',
                  'Get class-wide insights and analytics',
                  'Manage classes with join codes and student rosters',
                ].map((item, i) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="font-mono text-xs text-primary mt-0.5 shrink-0">
                      {String(i + 1).padStart(2, '0')}.
                    </span>
                    <span className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Students */}
            <div className="card-print p-8">
              <p className="label-mono text-accent">For Students</p>
              <h3 className="mt-2 font-display text-2xl font-semibold">The Reading Desk</h3>
              <ul className="mt-6 space-y-4">
                {[
                  'Self-study library with open-access research papers',
                  'Guided reading with AI-powered assistance',
                  'Interactive quizzes to test understanding',
                  'Earn XP and build your reading streak',
                ].map((item, i) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="font-mono text-xs text-primary mt-0.5 shrink-0">
                      {String(i + 1).padStart(2, '0')}.
                    </span>
                    <span className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA: the ink band ── */}
      <section className="py-24 bg-[var(--color-border-strong)] text-[var(--color-bg)]">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] opacity-60">
            § Fin — Your Turn
          </p>
          <h2 className="mt-4 font-display text-4xl md:text-5xl font-semibold">
            Start Reading Smarter Today
          </h2>
          <p className="mt-5 opacity-70 max-w-xl mx-auto leading-relaxed">
            Join thousands of students and teachers who are transforming how they
            read and understand research papers.
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="mt-9 btn-accent px-9 py-3.5 text-base"
          >
            Get Started Free
          </button>
        </div>
      </section>

      {/* ── Colophon ── */}
      <footer className="py-10 border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <Wordmark />
          <p className="font-display italic text-sm text-[var(--color-text-secondary)]">
            Built for curious minds
          </p>
          <nav className="flex items-center gap-4 font-mono text-xs text-[var(--color-text-secondary)]">
            <a href="/terms" className="hover:text-accent underline-offset-4 hover:underline transition-colors">
              Terms
            </a>
            <a
              href="mailto:legal@readlabs.org?subject=Copyright%20Infringement%20Report"
              className="hover:text-accent underline-offset-4 hover:underline transition-colors"
            >
              Report copyright
            </a>
            <span>&copy; {new Date().getFullYear()} ReadLabs</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
