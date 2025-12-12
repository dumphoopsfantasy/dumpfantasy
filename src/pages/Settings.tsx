import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Settings2, Link2, RefreshCw, Database, Upload, MessageSquare, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export const Settings = () => {
  const [espnSettings, setEspnSettings] = useState({
    leagueId: "",
    teamId: "",
    season: "2025",
    swid: "",
    espnS2: "",
  });
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const handleSave = () => {
    // TODO: Save settings to local storage or backend
    localStorage.setItem("espn_settings", JSON.stringify(espnSettings));
    toast({
      title: "Settings saved",
      description: "Your ESPN settings have been saved.",
    });
  };

  const handleSync = () => {
    toast({
      title: "Coming Soon",
      description: "ESPN sync functionality is under development.",
    });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Settings2 className="w-6 h-6 text-primary" />
        <h2 className="font-display font-bold text-2xl">Settings</h2>
      </div>

      {/* ESPN Integration */}
      <Card className="gradient-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link2 className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="font-display">ESPN Fantasy Integration</CardTitle>
                <CardDescription>Connect your ESPN Fantasy Basketball account</CardDescription>
              </div>
            </div>
            <Badge variant="secondary">Future</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="leagueId">League ID</Label>
              <Input
                id="leagueId"
                placeholder="e.g., 12345678"
                value={espnSettings.leagueId}
                onChange={(e) => setEspnSettings({ ...espnSettings, leagueId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teamId">Team ID</Label>
              <Input
                id="teamId"
                placeholder="e.g., 1"
                value={espnSettings.teamId}
                onChange={(e) => setEspnSettings({ ...espnSettings, teamId: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="season">Season</Label>
            <Input
              id="season"
              placeholder="2025"
              value={espnSettings.season}
              onChange={(e) => setEspnSettings({ ...espnSettings, season: e.target.value })}
            />
          </div>

          <Separator />

          <p className="text-sm text-muted-foreground">
            For private leagues, you'll need to provide authentication cookies. 
            <a href="#" className="text-primary ml-1 hover:underline">Learn how to find these</a>
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="swid">SWID Cookie</Label>
              <Input
                id="swid"
                type="password"
                placeholder="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"
                value={espnSettings.swid}
                onChange={(e) => setEspnSettings({ ...espnSettings, swid: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="espnS2">espn_s2 Cookie</Label>
              <Input
                id="espnS2"
                type="password"
                placeholder="AEBxxxxxxxxxx..."
                value={espnSettings.espnS2}
                onChange={(e) => setEspnSettings({ ...espnSettings, espnS2: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={handleSave} className="flex-1">
              Save Settings
            </Button>
            <Button onClick={handleSync} variant="outline" disabled className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Sync from ESPN
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card className="gradient-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="font-display">Data Management</CardTitle>
              <CardDescription>Import and export your fantasy data</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Button variant="outline" className="h-24 flex-col gap-2">
              <Upload className="w-5 h-5" />
              <span>Import from Excel</span>
            </Button>
            <Button variant="outline" className="h-24 flex-col gap-2">
              <Database className="w-5 h-5" />
              <span>Export Data</span>
            </Button>
          </div>
        </CardContent>
      </Card>

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
                  
                  window.open(`mailto:dumpyourproducer@gmail.com?subject=${subject}&body=${body}`, '_blank');
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
            <p className="text-sm text-muted-foreground">
              Fantasy basketball analytics powered by your data.
            </p>
            <p className="text-xs text-muted-foreground mt-4">Version 1.0.0</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};