import type { createClient } from "@/lib/supabase";

/** Only a confirmed submission counts as having sent the workout. Dates follow the team's Warsaw calendar. */
export async function pendingTrainingDate(
  client: NonNullable<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: member, error: memberError } = await client
    .from("team_members")
    .select("role, team_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (member?.role !== "athlete") return null;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const { data: training, error: trainingError } = await client
    .from("trainings")
    .select("id")
    .eq("team_id", member.team_id)
    .eq("training_on", date)
    .maybeSingle();
  if (trainingError) throw trainingError;
  if (!training) return null;
  const { data: submission, error: submissionError } = await client
    .from("training_submissions")
    .select("confirmed_at")
    .eq("training_id", training.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (submissionError) throw submissionError;
  return submission?.confirmed_at ? null : date;
}
