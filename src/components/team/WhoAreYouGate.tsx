import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  serverError?: string | null;
}

type Role = "coach" | "athlete";

const inputClassName =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const labelClassName = "mb-1 block text-sm text-muted-foreground";

export default function WhoAreYouGate({ serverError }: Props) {
  const [role, setRole] = useState<Role | null>(null);

  if (role === null) {
    return (
      <div className="space-y-4">
        <h1 className="mb-6 text-center text-2xl font-semibold">Kim jesteś?</h1>
        {serverError && (
          <p className="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-lg border px-3 py-2 text-sm">
            {serverError}
          </p>
        )}
        <Button
          type="button"
          className="h-10 w-full"
          onClick={() => {
            setRole("coach");
          }}
        >
          Trener
        </Button>
        <Button
          type="button"
          className="h-10 w-full"
          onClick={() => {
            setRole("athlete");
          }}
        >
          Zawodnik
        </Button>
      </div>
    );
  }

  if (role === "coach") {
    return (
      <>
        <h1 className="mb-6 text-center text-2xl font-semibold">Załóż zespół</h1>
        <form method="POST" action="/api/team" className="space-y-4">
          <div>
            <label htmlFor="display_name" className={labelClassName}>
              Imię i nazwisko
            </label>
            <input id="display_name" name="display_name" type="text" required className={inputClassName} />
          </div>
          <div>
            <label htmlFor="team_name" className={labelClassName}>
              Nazwa zespołu
            </label>
            <input id="team_name" name="team_name" type="text" required className={inputClassName} />
          </div>
          <Button type="submit" className="h-10 w-full">
            Załóż zespół
          </Button>
        </form>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-semibold">Dołącz do zespołu</h1>
      <form method="POST" action="/api/team/join" className="space-y-4">
        <div>
          <label htmlFor="display_name" className={labelClassName}>
            Imię i nazwisko
          </label>
          <input id="display_name" name="display_name" type="text" required className={inputClassName} />
        </div>
        <div>
          <label htmlFor="join_code" className={labelClassName}>
            Kod zespołu
          </label>
          <input id="join_code" name="join_code" type="text" required className={inputClassName} />
        </div>
        <Button type="submit" className="h-10 w-full">
          Dołącz
        </Button>
      </form>
    </>
  );
}
