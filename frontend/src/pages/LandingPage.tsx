import { useState, useEffect, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Upload,
  Sparkles,
  Compass,
  HelpCircle,
  Flame,
  Users,
  GraduationCap,
  ArrowRight,
  CheckCircle,
  MessageSquare,
  Search,
  FileText,
  BrainCircuit,
  BarChart3,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

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
    <div className="min-h-screen bg-surface text-[var(--color-text)]">
      {/* ── Top Nav ── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-surface shadow-card' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary font-bold text-xl">
            <BookOpen className="w-7 h-7" />
            <span>ReadLabs</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={() => navigate('/auth')}
              className="btn-secondary text-sm"
            >
              Login
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="btn-primary text-sm"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 lg:pt-40 lg:pb-28">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight">
              Read Research Papers{' '}
              <span className="text-primary">Like a Pro</span>
            </h1>
            <p className="mt-6 text-lg text-[var(--color-text-secondary)] max-w-xl leading-relaxed">
              AI-guided reading that breaks down complex research into
              interactive, section-by-section lessons — with checkpoints,
              quizzes, and real-time feedback built for students.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <button onClick={() => navigate('/auth')} className="btn-primary flex items-center gap-2">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={scrollToHow} className="btn-outline flex items-center gap-2">
                See How It Works
              </button>
            </div>
          </div>

          {/* ── Three-Panel Reading Layout Mockup ── */}
          <div className="hidden lg:block">
            <div className="rounded-xl border border-border shadow-card overflow-hidden">
              {/* title bar */}
              <div className="bg-muted flex items-center gap-2 px-4 py-3">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="ml-4 text-xs text-[var(--color-text-secondary)] font-medium">
                  readlabs.app / student / read / neural-networks-biology
                </span>
              </div>
              {/* three-panel content */}
              <div className="bg-surface flex" style={{ height: 280 }}>
                {/* Left: Sections Sidebar */}
                <div className="w-44 border-r border-border p-3 space-y-2 shrink-0">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">Sections</p>
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-primary/10 rounded-md">
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">1</span>
                    <span className="text-xs font-medium">Introduction</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                    <span className="w-5 h-5 rounded-full bg-muted text-[var(--color-text-secondary)] text-[10px] flex items-center justify-center font-bold">2</span>
                    <span className="text-xs text-[var(--color-text-secondary)]">Methods</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                    <span className="w-5 h-5 rounded-full bg-muted text-[var(--color-text-secondary)] text-[10px] flex items-center justify-center font-bold">3</span>
                    <span className="text-xs text-[var(--color-text-secondary)]">Results</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                    <span className="w-5 h-5 rounded-full bg-muted text-[var(--color-text-secondary)] text-[10px] flex items-center justify-center font-bold">4</span>
                    <span className="text-xs text-[var(--color-text-secondary)]">Discussion</span>
                  </div>
                  <div className="border-t border-border my-2" />
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Structure Guide</p>
                  <div className="flex gap-1">
                    <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">2I</span>
                    <span className="text-[9px] bg-muted text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded">1M</span>
                    <span className="text-[9px] bg-muted text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded">1R</span>
                  </div>
                </div>

                {/* Center: PDF Viewer */}
                <div className="flex-1 p-4 flex flex-col items-center justify-center bg-muted/30">
                  <div className="w-full max-w-[180px] bg-white border border-border rounded-md p-3 space-y-2 shadow-sm">
                    <div className="h-2 bg-gray-200 rounded w-3/4" />
                    <div className="h-2 bg-gray-200 rounded w-full" />
                    <div className="h-2 bg-gray-200 rounded w-5/6" />
                    <div className="h-2 bg-gray-200 rounded w-2/3" />
                    <div className="h-2 bg-gray-200 rounded w-full" />
                    <div className="h-2 bg-gray-200 rounded w-4/6" />
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-[10px] text-[var(--color-text-secondary)]">
                    <span>Page 1 of 12</span>
                    <span className="text-primary font-medium">100%</span>
                  </div>
                </div>

                {/* Right: AI Guidance Panel */}
                <div className="w-52 border-l border-border p-3 space-y-3 shrink-0">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">AI Guidance</p>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold">Guiding Questions</p>
                    <div className="h-1.5 bg-muted rounded w-full" />
                    <div className="h-1.5 bg-muted rounded w-3/4" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold">Your Response</p>
                    <div className="h-8 bg-muted rounded w-full" />
                    <div className="h-5 bg-primary rounded w-16 flex items-center justify-center">
                      <span className="text-[8px] text-white font-bold">Submit</span>
                    </div>
                  </div>
                  <div className="border-t border-border pt-2 space-y-1.5">
                    <p className="text-[10px] font-semibold">Look up a term</p>
                    <div className="h-5 bg-muted rounded w-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 bg-muted">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center">
            How It Works
          </h2>
          <p className="mt-4 text-[var(--color-text-secondary)] text-center max-w-2xl mx-auto">
            Three simple steps to transform how you read research papers.
          </p>
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                num: '1',
                title: 'Upload a Paper',
                desc: 'Paste a URL or upload a PDF — our AI extracts every section in seconds.',
                Icon: Upload,
              },
              {
                num: '2',
                title: 'AI Generates Your Guide',
                desc: 'Guiding questions, checkpoints, and quizzes are created automatically for each section.',
                Icon: Sparkles,
              },
              {
                num: '3',
                title: 'Read Interactively',
                desc: 'Work through each section with AI prompts, submit checkpoints, and track your progress.',
                Icon: BookOpen,
              },
            ].map(({ num, title, desc, Icon }) => (
              <div key={num} className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-bold shadow-card">
                  {num}
                </div>
                <div className="mt-5 w-12 h-12 text-primary">
                  <Icon className="w-full h-full" />
                </div>
                <h3 className="mt-4 text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-[var(--color-text-secondary)] leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center">
            Everything You Need to Read Smarter
          </h2>
          <p className="mt-4 text-[var(--color-text-secondary)] text-center max-w-2xl mx-auto">
            Powerful features designed to make research papers accessible to every student.
          </p>
          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
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
            ].map(({ Icon, title, desc }) => (
              <div
                key={title}
                className="card-hover rounded-xl p-6 border border-border"
              >
                <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-[var(--color-text-secondary)] text-sm leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Reading Experience Showcase ── */}
      <section className="py-24 bg-muted">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center">
            A Smarter Way to Read
          </h2>
          <p className="mt-4 text-[var(--color-text-secondary)] text-center max-w-2xl mx-auto">
            Every tool you need is right where you need it — alongside the paper.
          </p>
          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Student reading experience */}
            <div className="card-hover rounded-xl border border-border p-8 bg-surface">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold">The Reading Experience</h3>
              </div>
              <ul className="space-y-4">
                {[
                  'Three-panel layout: sections, PDF, and AI guidance side by side',
                  'Section-by-section checkpoints with instant AI feedback',
                  'So What? reflection to connect ideas across sections',
                  'Built-in PDF viewer with zoom and page navigation',
                  'Structure guide showing the paper\'s organization at a glance',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Teacher tools */}
            <div className="card-hover rounded-xl border border-border p-8 bg-surface">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold">Teacher Tools</h3>
              </div>
              <ul className="space-y-4">
                {[
                  'Upload papers and assign them to your classes',
                  'Review student checkpoint responses with AI-generated feedback',
                  'Track reading progress and completion across your class',
                  'Drill down into individual student sessions and answers',
                  'Dashboard with assignment analytics and class insights',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
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

      {/* ── For Teachers / For Students ── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center">
            Built for Every Classroom
          </h2>
          <p className="mt-4 text-[var(--color-text-secondary)] text-center max-w-2xl mx-auto">
            Whether you are teaching or learning, ReadLabs has you covered.
          </p>
          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Teachers */}
            <div className="card-hover rounded-xl border border-border p-8 bg-surface">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold">For Teachers</h3>
              </div>
              <ul className="space-y-4">
                {[
                  'Upload papers and assign them to your classes',
                  'Review student responses and reading progress',
                  'Get class-wide insights and analytics',
                  'Manage classes with join codes and student rosters',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Students */}
            <div className="card-hover rounded-xl border border-border p-8 bg-surface">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold">For Students</h3>
              </div>
              <ul className="space-y-4">
                {[
                  'Self-study library with open-access research papers',
                  'Guided reading with AI-powered assistance',
                  'Interactive quizzes to test understanding',
                  'Earn XP and build your reading streak',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
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

      {/* ── Final CTA ── */}
      <section className="py-24 bg-primary">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Start Reading Smarter Today
          </h2>
          <p className="mt-4 text-indigo-100 max-w-xl mx-auto">
            Join thousands of students and teachers who are transforming how they
            read and understand research papers.
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="mt-8 bg-white text-primary font-semibold px-8 py-3 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            Get Started Free
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-primary font-bold text-lg">
            <BookOpen className="w-5 h-5" />
            <span>ReadLabs</span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Built for curious minds
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            &copy; {new Date().getFullYear()} ReadLabs
          </p>
        </div>
      </footer>
    </div>
  );
}
