import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MessageSquare, Palette, RotateCcw, Send, Settings2, Target } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  NBA_THEMES,
  NBATheme,
  applyTheme,
  clearSavedTheme,
  getSavedTheme,
  resetTheme,
  saveTheme,
} from "@/lib/nbaThemes";
import { WeightSettings, type CustomWeights } from "@/components/WeightSettings";

interface SettingsProps {
  weights: CustomWeights;
  onWeightsChange: (weights: CustomWeights) => void;
  showDraftTab: boolean;
  onShowDraftTabChange: (show: boolean) => void;
  showTradeTab: boolean;
  onShowTradeTabChange: (show: boolean) => void;
}

export const Settings = ({ weights, onWeightsChange, showDraftTab, onShowDraftTabChange, showTradeTab, onShowTradeTabChange }: SettingsProps) => {
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<NBATheme | null>(null);

  useEffect(() => {
    const saved = getSavedTheme();
    if (saved) setSelectedTheme(saved);
  }, []);

  const handleThemeChange = (abbr: string) => {
    const theme = NBA_THEMES.find((t) => t.abbr === abbr);
    if (!theme) return;

    setSelectedTheme(theme);
    applyTheme(theme);
    saveTheme(theme);
    toast({
      title: "Theme Applied",
      description: `${theme.team} theme is now active.`,
    });
  };

  const handleResetTheme = () => {
    setSelectedTheme(null);
    resetTheme();
    clearSavedTheme();
    toast({
      title: "Theme Reset",
      description: "Reverted to default basketball orange theme.",
    });
  };

  const hexToPreviewStyle = (hex: string) => ({ backgroundColor: hex });

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Settings2 className="w-6 h-6 text-primary" />
        <h2 className="font-display font-bold text-2xl">Settings</h2>
      </div>

      {/* Theme Selector */}
      <Card className="gradient-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="font-display">Team Theme</CardTitle>
              <CardDescription>Customize app colors with your favorite NBA team</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme">Favorite NBA Team</Label>
            <Select value={selectedTheme?.abbr || ""} onValueChange={handleThemeChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a team theme..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {NBA_THEMES.map((theme) => (
                  <SelectItem key={theme.abbr} value={theme.abbr}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full border border-border"
                        style={hexToPreviewStyle(theme.primary)}
                      />
                      {theme.team}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTheme && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Color Preview</Label>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <div className="h-8 rounded-md border border-border" style={hexToPreviewStyle(selectedTheme.primary)} />
                  <p className="text-xs text-center text-muted-foreground">Primary</p>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="h-8 rounded-md border border-border" style={hexToPreviewStyle(selectedTheme.secondary)} />
                  <p className="text-xs text-center text-muted-foreground">Secondary</p>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="h-8 rounded-md border border-border" style={hexToPreviewStyle(selectedTheme.accent)} />
                  <p className="text-xs text-center text-muted-foreground">Accent</p>
                </div>
              </div>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={handleResetTheme} className="w-full">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Default Theme
          </Button>
        </CardContent>
      </Card>

      {/* Feature Toggles */}
      <Card className="gradient-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Target className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="font-display">Feature Toggles</CardTitle>
              <CardDescription>Show or hide experimental features</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="draft-toggle">Draft Strategy Tab</Label>
              <p className="text-xs text-muted-foreground">
                Show the Draft Strategy tab for pre-draft preparation
              </p>
            </div>
            <Switch
              id="draft-toggle"
              checked={showDraftTab}
              onCheckedChange={onShowDraftTabChange}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="trade-toggle">Trade Analyzer Tab</Label>
              <p className="text-xs text-muted-foreground">
                Show the Trade Analyzer tab for evaluating trades
              </p>
            </div>
            <Switch
              id="trade-toggle"
              checked={showTradeTab}
              onCheckedChange={onShowTradeTabChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Weights (wCRI) */}
      <WeightSettings weights={weights} onWeightsChange={onWeightsChange} />


      {/* Feedback */}
      <Card className="gradient-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="font-display">Questions / Comments</CardTitle>
              <CardDescription>Send us your feedback or suggestions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedbackSubmitted ? (
            <div className="text-center py-4">
              <p className="text-stat-positive font-semibold">Thank you for your feedback!</p>
              <p className="text-sm text-muted-foreground mt-1">We appreciate you taking the time to reach out.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setFeedbackSubmitted(false);
                  setFeedbackMessage("");
                }}
              >
                Send Another
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="feedback">Your Message</Label>
                <Textarea
                  id="feedback"
                  placeholder="Share your thoughts, report a bug, or suggest a feature..."
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
              <Button
                onClick={() => {
                  if (!feedbackMessage.trim()) {
                    toast({
                      title: "Message required",
                      description: "Please enter a message before submitting.",
                      variant: "destructive",
                    });
                    return;
                  }

                  const timestamp = new Date().toISOString();
                  const subject = encodeURIComponent("DumpHoops Feedback");
                  const body = encodeURIComponent(
                    `Message:\n${feedbackMessage}\n\n---\nTimestamp: ${timestamp}\nSent from: DumpHoops Analytics Settings`
                  );

                  window.open(`mailto:dumpyourproducer@gmail.com?subject=${subject}&body=${body}`, "_blank");
                  setFeedbackSubmitted(true);

                  toast({
                    title: "Email client opened",
                    description: "Complete sending in your email app to submit feedback.",
                  });
                }}
                className="w-full flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Submit Feedback
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card className="gradient-card border-border">
        <CardContent className="pt-6">
          <div className="text-center">
            <h3 className="font-display font-bold text-xl text-gradient mb-2">DumpHoops Analytics</h3>
            <p className="text-sm text-muted-foreground">Fantasy basketball analytics powered by your data.</p>
            <p className="text-xs text-muted-foreground mt-4">Version 1.0.0</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
