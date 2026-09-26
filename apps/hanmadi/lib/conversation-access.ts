import { getTutorSession } from "./students";
import { parseEnvTutors } from "./auth";

/** A paid endpoint must not accept the legacy empty derived signing key. */
export async function getConversationTutor() {
  if (
    !process.env.AUTH_SECRET &&
    !process.env.TUTOR_PINS &&
    !process.env.TUTOR_PIN
  )
    return null;
  const session = await getTutorSession();
  if (!session || (session.r !== "owner" && session.r !== "tutor")) return null;
  if (
    session.r === "owner" &&
    !parseEnvTutors(process.env).some((t) => t.name === session.n)
  )
    return null;
  return session;
}
