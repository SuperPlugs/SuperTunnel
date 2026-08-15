import {
  KeyRound,
  Route,
  Server,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { resolveServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export default function Home() {
  const status = resolveServerConfig().status;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center px-5 py-4">
          <div className="flex items-center gap-2">
            <Icons.logo className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold">SuperTunnel</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-5 py-8">
        <section className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Controller status</p>
            <h2 className="text-2xl font-semibold">Connection API</h2>
          </div>
          {status.ready ? (
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <ShieldCheck className="h-5 w-5" /> Ready
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <ShieldAlert className="h-5 w-5" /> Not configured
            </div>
          )}
        </section>

        {status.error && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Configuration required</AlertTitle>
            <AlertDescription>{status.error}</AlertDescription>
          </Alert>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Server className="h-4 w-4" /> API endpoint
              </CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-sm">/api/connect</CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Route className="h-4 w-4" /> Profile mode
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-semibold">
              {status.mode === "pac" ? "PAC script" : status.mode === "fixed" ? "Fixed proxy" : "None"}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <KeyRound className="h-4 w-4" /> Authentication
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-semibold">
              {status.authRequired ? "Bearer token" : "Disabled"}
            </CardContent>
          </Card>
        </section>

        <section className="border-t pt-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-[160px_1fr]">
            <dt className="text-muted-foreground">Proxy target</dt>
            <dd className="break-all font-mono">{status.target ?? "Not configured"}</dd>
            <dt className="text-muted-foreground">Health endpoint</dt>
            <dd className="font-mono">/api/status</dd>
          </dl>
        </section>
      </main>
    </div>
  );
}
