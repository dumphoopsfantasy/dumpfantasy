import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  FileText,
  Shield,
  HelpCircle,
  Heart,
  ExternalLink,
  Copy,
  Check,
  ChevronRight,
  Scale,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  DISCLAIMER_CONTENT,
  TERMS_CONTENT,
  PRIVACY_CONTENT,
  FAQ_CONTENT,
  SUPPORT_CONTENT,
} from "@/lib/legalContent";

type SheetType = "disclaimer" | "terms" | "privacy" | "faq" | "support" | null;

export function LegalSupportSection() {
  const [openSheet, setOpenSheet] = useState<SheetType>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const handleCopyLink = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(url);
      toast({ title: "Copied!", description: `${label} link copied to clipboard.` });
      setTimeout(() => setCopiedLink(null), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Please copy manually.", variant: "destructive" });
    }
  };

  const menuItems = [
    {
      key: "disclaimer" as const,
      icon: AlertTriangle,
      label: "Disclaimer",
      description: "Important beta notice",
      priority: true,
    },
    {
      key: "terms" as const,
      icon: FileText,
      label: "Terms of Use",
      description: "Usage guidelines",
    },
    {
      key: "privacy" as const,
      icon: Shield,
      label: "Privacy Policy",
      description: "How we handle data",
    },
    {
      key: "faq" as const,
      icon: HelpCircle,
      label: "FAQ",
      description: "Common questions",
    },
    {
      key: "support" as const,
      icon: Heart,
      label: "Support & Donate",
      description: "Help the project",
    },
  ];

  const renderMarkdown = (text: string) => {
    // Simple markdown-like rendering for bold
    return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  const renderContent = (content: string) => {
    // Handle newlines and lists
    const lines = content.split("\n");
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ")) {
        return (
          <li key={i} className="ml-4 list-disc">
            {renderMarkdown(trimmed.slice(2))}
          </li>
        );
      }
      if (trimmed === "") return <br key={i} />;
      return (
        <p key={i} className="mb-2">
          {renderMarkdown(trimmed)}
        </p>
      );
    });
  };

  return (
    <>
      <Card className="gradient-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="font-display">Legal & Support</CardTitle>
              <CardDescription>Disclaimer, terms, privacy, and help</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {menuItems.map((item, idx) => (
            <div key={item.key}>
              <button
                onClick={() => setOpenSheet(item.key)}
                className={`w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors text-left ${
                  item.priority ? "bg-primary/5 border border-primary/20" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon
                    className={`w-4 h-4 ${item.priority ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <div>
                    <p className={`text-sm font-medium ${item.priority ? "text-primary" : ""}`}>
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              {idx < menuItems.length - 1 && <Separator className="my-1" />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Disclaimer Sheet */}
      <Sheet open={openSheet === "disclaimer"} onOpenChange={(open) => !open && setOpenSheet(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-primary">
              <AlertTriangle className="w-5 h-5" />
              {DISCLAIMER_CONTENT.title}
            </SheetTitle>
            <SheetDescription>Last updated: {DISCLAIMER_CONTENT.lastUpdated}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-140px)] mt-4 pr-4">
            <div className="space-y-6">
              {DISCLAIMER_CONTENT.sections.map((section, idx) => (
                <div key={idx}>
                  <h3 className="font-semibold text-sm text-foreground mb-2">{section.heading}</h3>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    {renderMarkdown(section.content)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Terms Sheet */}
      <Sheet open={openSheet === "terms"} onOpenChange={(open) => !open && setOpenSheet(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {TERMS_CONTENT.title}
            </SheetTitle>
            <SheetDescription>Last updated: {TERMS_CONTENT.lastUpdated}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-140px)] mt-4 pr-4">
            {/* Mini TOC */}
            <div className="mb-6 p-3 bg-muted/30 rounded-lg">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Jump to:</p>
              <div className="flex flex-wrap gap-2">
                {TERMS_CONTENT.sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#terms-${s.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    {s.heading}
                  </a>
                ))}
              </div>
            </div>
            <div className="space-y-6">
              {TERMS_CONTENT.sections.map((section) => (
                <div key={section.id} id={`terms-${section.id}`}>
                  <h3 className="font-semibold text-sm text-foreground mb-2">{section.heading}</h3>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    {renderContent(section.content)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Privacy Sheet */}
      <Sheet open={openSheet === "privacy"} onOpenChange={(open) => !open && setOpenSheet(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {PRIVACY_CONTENT.title}
            </SheetTitle>
            <SheetDescription>Last updated: {PRIVACY_CONTENT.lastUpdated}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-140px)] mt-4 pr-4">
            {/* Mini TOC */}
            <div className="mb-6 p-3 bg-muted/30 rounded-lg">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Jump to:</p>
              <div className="flex flex-wrap gap-2">
                {PRIVACY_CONTENT.sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#privacy-${s.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    {s.heading}
                  </a>
                ))}
              </div>
            </div>
            <div className="space-y-6">
              {PRIVACY_CONTENT.sections.map((section) => (
                <div key={section.id} id={`privacy-${section.id}`}>
                  <h3 className="font-semibold text-sm text-foreground mb-2">{section.heading}</h3>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    {renderContent(section.content)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* FAQ Sheet */}
      <Sheet open={openSheet === "faq"} onOpenChange={(open) => !open && setOpenSheet(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5" />
              {FAQ_CONTENT.title}
            </SheetTitle>
            <SheetDescription>Last updated: {FAQ_CONTENT.lastUpdated}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-140px)] mt-4 pr-4">
            <div className="space-y-6">
              {FAQ_CONTENT.sections.map((section) => (
                <div key={section.id} id={`faq-${section.id}`} className="space-y-2">
                  <h3 className="font-semibold text-sm text-foreground">{section.question}</h3>
                  <div className="text-sm text-muted-foreground leading-relaxed pl-3 border-l-2 border-primary/30">
                    {renderContent(section.answer)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Support Sheet */}
      <Sheet open={openSheet === "support"} onOpenChange={(open) => !open && setOpenSheet(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-stat-positive" />
              {SUPPORT_CONTENT.title}
            </SheetTitle>
            <SheetDescription>{SUPPORT_CONTENT.description}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-140px)] mt-4 pr-4">
            <div className="space-y-6">
              {/* Donate */}
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-primary" />
                  Donate via Venmo
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Every contribution helps cover hosting and fuels new features. Thank you!
                </p>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => window.open(SUPPORT_CONTENT.venmoUrl, "_blank")}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Donate on Venmo
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyLink(SUPPORT_CONTENT.venmoUrl, "Venmo")}
                  >
                    {copiedLink === SUPPORT_CONTENT.venmoUrl ? (
                      <Check className="w-4 h-4 text-stat-positive" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {SUPPORT_CONTENT.venmoHandle}
                </p>
              </div>

              {/* Report Bug */}
              <div className="p-4 rounded-lg bg-muted/30 border border-border">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Report a Bug / Request a Feature
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Found something broken or have an idea? Let us know on GitHub.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.open(SUPPORT_CONTENT.githubIssuesUrl, "_blank")}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open GitHub Issues
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyLink(SUPPORT_CONTENT.githubIssuesUrl, "GitHub Issues")}
                  >
                    {copiedLink === SUPPORT_CONTENT.githubIssuesUrl ? (
                      <Check className="w-4 h-4 text-stat-positive" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Contact */}
              <div className="p-4 rounded-lg bg-muted/30 border border-border">
                <h3 className="font-semibold text-sm mb-2">Contact</h3>
                <p className="text-sm text-muted-foreground">
                  For other inquiries: <span className="font-mono text-primary">{SUPPORT_CONTENT.email}</span>
                </p>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}

// Export a small footer component for the main layout
export function DisclaimerFooter({ onOpenDisclaimer }: { onOpenDisclaimer: () => void }) {
  return (
    <footer className="py-4 px-4 border-t border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>Not affiliated with ESPN, NBA, or NBPA</span>
        <span className="hidden sm:inline">•</span>
        <button
          onClick={onOpenDisclaimer}
          className="text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded"
        >
          Disclaimer
        </button>
      </div>
    </footer>
  );
}
