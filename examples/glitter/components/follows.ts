import type {
  Graffiti,
  GraffitiSession,
} from "@graffiti-garden/api";
import { followSchema } from "./schemas";

export type FollowObject = {
  url: string;
  value: { object: string };
};

export async function postFollow(
  graffiti: Graffiti,
  object: string,
  session: GraffitiSession,
) {
  return graffiti.post<ReturnType<typeof followSchema>>(
    {
      value: {
        activity: "Follow",
        object,
      },
      channels: [session.actor],
    },
    session,
  );
}

export async function deleteFollows(
  graffiti: Graffiti,
  follows: FollowObject[],
  session: GraffitiSession,
) {
  await Promise.all(
    follows.map((follow) => graffiti.delete(follow.url, session)),
  );
}
