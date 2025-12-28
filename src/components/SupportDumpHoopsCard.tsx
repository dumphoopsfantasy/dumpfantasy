import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { QRCodeCanvas } from "qrcode.react";
import { Heart, Copy, ExternalLink } from "lucide-react";

const VENMO_URL = "https://venmo.com/u/Demitri_Voyiatzis";
const VENMO_HANDLE = "@Demitri_Voyiatzis";

export function SupportDumpHoopsCard() {
  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(VENMO_HANDLE);
      toast({ 
        title: "Copied", 
        description: `${VENMO_HANDLE} copied to clipboard.` 
      });
    } catch {
      toast({ 
        title: "Copy failed", 
        description: "Couldn't access clipboard. Copy manually.",
        variant: "destructive",
      });
    }
  };

  const openVenmo = () => {
    window.open(VENMO_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <Card className="gradient-card border-border">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Heart className="w-5 h-5 text-primary" />
          <div>
            <CardTitle className="font-display">Support DumpHoops</CardTitle>
            <CardDescription>
              DumpHoops is built and maintained independently. If this tool helps you, 
              consider a small donation to support hosting costs and new features 
              (matchup projections, trade tools, schedule forecasting). Donations are 
              optional — thank you.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={openVenmo} 
            className="flex-1 gradient-primary font-semibold"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Donate via Venmo
          </Button>
          <Button 
            variant="outline" 
            onClick={copyHandle}
            className="flex-1"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Venmo
          </Button>
        </div>

        {/* Suggested amount */}
        <p className="text-xs text-muted-foreground text-center">
          Suggested: $5–$20
        </p>

        {/* QR Code section */}
        <div className="flex flex-col items-center gap-3 pt-4 border-t border-border">
          <div className="bg-white p-3 rounded-lg">
            <QRCodeCanvas 
              value={VENMO_URL} 
              size={120}
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Scan to donate</p>
            <p className="text-sm font-mono text-primary">{VENMO_HANDLE}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
