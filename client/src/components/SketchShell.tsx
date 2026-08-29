import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BookOpenText, Clapperboard, FolderOpen, Grid2X2, HelpCircle, ImageUp, MessageCirclePlus, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

type ActiveRoute = "myLibrary" | "library" | "ask" | "docs";

const workspaceLinks = [
  { id: "myLibrary", label: "My projects", href: "/my-library", icon: FolderOpen },
  { id: "ask", label: "Ask my footage", href: "/ask", icon: MessageCirclePlus },
] as const;

const sampleLinks = [
  { id: "library", label: "Sample playground", href: "/sample", icon: Grid2X2 },
] as const;

export function SketchShell({ active, onUpload, children }: { active: ActiveRoute; onUpload: () => void; children: ReactNode }) {
  const { user, loading, isAuthenticated, isPrototype, logout } = useAuth();
  return <div className="app-glow min-h-screen overflow-x-hidden ink">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[226px] border-r-[1.5px] border-[#2c2922]/65 bg-[#fffdf7]/90 px-4 py-6 backdrop-blur lg:flex lg:flex-col">
      <Link href="/" className="flex items-center gap-3 px-2"><div className="grid size-10 -rotate-6 place-items-center rounded-[14px] border-[1.5px] border-[#2c2922] bg-[#f4ad89] shadow-[2px_3px_0_#2c2922]"><Clapperboard className="size-4" /></div><div><p className="font-hand text-2xl font-bold leading-none tracking-[-.04em]">framefind</p><p className="mt-1 font-mono text-[8px] uppercase tracking-[.18em] ink-muted">footage sketchbook</p></div></Link>
      <div className="mt-10"><p className="px-3 font-mono text-[9px] uppercase tracking-[.18em] ink-muted">Your Workspace</p><nav className="mt-2 space-y-2">{workspaceLinks.map(item => { const Icon = item.icon; const selected = active === item.id; return <Link key={item.id} href={item.href} className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors", selected ? "border-[1.5px] border-[#2c2922]/55 bg-[#f8d9cc] font-semibold shadow-[2px_2px_0_rgba(44,41,34,.16)]" : "ink-muted hover:bg-[#e6f1e2] hover:text-[#2c2922]")}><Icon className="size-4" />{item.label}</Link>; })}</nav></div>
      <div className="mt-7"><p className="px-3 font-mono text-[9px] uppercase tracking-[.18em] ink-muted">Explore</p><nav className="mt-2 space-y-2">{sampleLinks.map(item => { const Icon = item.icon; return <Link key={item.id} href={item.href} className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors", active === item.id ? "border-[1.5px] border-[#2c2922]/55 bg-[#fff1ba] font-semibold shadow-[2px_2px_0_rgba(44,41,34,.16)]" : "ink-muted hover:bg-[#fff1ba] hover:text-[#2c2922]")}><Icon className="size-4" />{item.label}</Link>; })}</nav></div>
      <div className="mt-7"><p className="px-3 font-mono text-[9px] uppercase tracking-[.18em] ink-muted">Help</p><nav className="mt-2 space-y-2"><Link href="/docs" className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors", active === "docs" ? "border-[1.5px] border-[#2c2922]/55 bg-[#e8eff7] font-semibold shadow-[2px_2px_0_rgba(44,41,34,.16)]" : "ink-muted hover:bg-[#e8eff7] hover:text-[#2c2922]")}><BookOpenText className="size-4" />Documentation</Link><Link href="/docs#sample" className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm ink-muted hover:bg-[#fff1ba] hover:text-[#2c2922]"><HelpCircle className="size-4" />About Sample</Link></nav></div>
      <div className="tape note-yellow mt-auto rotate-[1deg] rounded-xl border-[1.5px] border-[#2c2922]/55 p-3.5 shadow-[3px_3px_0_rgba(44,41,34,.15)]"><div className="flex items-center gap-2 text-[11px] font-semibold"><Sparkles className="size-3.5" />A gentle rule</div><p className="mt-2 text-[11px] leading-5 ink-muted">Framefind helps you notice footage. It never decides the story for you.</p></div>
    </aside>
    <main className="lg:ml-[226px]">
      <header className="sticky top-0 z-20 border-b-[1.5px] border-[#2c2922]/55 bg-[#f7f3eb]/90 px-4 py-3 backdrop-blur sm:px-7 lg:px-10"><div className="mx-auto flex max-w-[1560px] items-center gap-3"><Link href="/" className="grid size-9 -rotate-3 place-items-center rounded-xl sketch-outline bg-[#f4ad89] lg:hidden"><Clapperboard className="size-4" /></Link><div className="min-w-0 flex-1"><p className="font-hand text-xl font-bold leading-none sm:text-2xl">{active === "myLibrary" ? "My projects" : active === "library" ? "Sample playground" : active === "ask" ? "Ask my footage" : "Documentation"}</p><p className="mt-0.5 hidden font-mono text-[9px] uppercase tracking-[.15em] ink-muted sm:block">{active === "myLibrary" ? "Your uploads · your editing projects" : active === "library" ? "Public demo material · never your uploads" : active === "ask" ? "Creative reasoning from selected material" : "How Framefind works"}</p></div><Button onClick={onUpload} className="h-10 -rotate-1 rounded-xl border-[1.5px] border-[#2c2922] bg-[#f4ad89] px-3 text-xs font-bold text-[#2c2922] shadow-[2px_2px_0_#2c2922] hover:bg-[#fac7ae] sm:px-4"><ImageUp className="mr-1.5 size-4" /><span className="hidden sm:inline">Upload footage</span></Button>{!loading && (isAuthenticated ? <button onClick={logout}><Avatar className="size-9 border-[1.5px] border-[#2c2922]/70"><AvatarFallback className="bg-[#dcefdc] text-xs font-bold text-[#2c2922]">{user?.name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback></Avatar></button> : <div className="flex items-center gap-2">{isPrototype && <span className="hidden rounded-lg border border-[#2c2922]/35 bg-[#fff1ba] px-2 py-1 font-mono text-[9px] uppercase tracking-[.12em] ink-muted sm:inline-flex">Prototype</span>}<Button onClick={() => startLogin()} variant="ghost" className="h-10 rounded-xl text-xs ink-muted hover:bg-[#fffdf7] hover:text-[#2c2922]">Sign in</Button></div>)}</div></header>
      <nav className="border-b border-[#2c2922]/20 bg-[#fffdf7]/65 px-4 py-2 lg:hidden"><div className="flex gap-2 overflow-x-auto">{workspaceLinks.map(item => { const Icon = item.icon; return <Link key={item.id} href={item.href} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]", active === item.id ? "bg-[#f8d9cc] font-semibold" : "ink-muted")}><Icon className="size-3.5" />{item.label}</Link>; })}{sampleLinks.map(item => { const Icon = item.icon; return <Link key={item.id} href={item.href} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]", active === item.id ? "bg-[#fff1ba] font-semibold" : "ink-muted")}><Icon className="size-3.5" />Sample</Link>; })}<Link href="/docs" className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]", active === "docs" ? "bg-[#e8eff7] font-semibold" : "ink-muted")}><BookOpenText className="size-3.5" />Docs</Link></div></nav>
      {children}
    </main>
  </div>;
}
