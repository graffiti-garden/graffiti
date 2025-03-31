import type { GraffitiSession } from "@graffiti-garden/api";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import type { ChatNameSchema, MemberUpdateSchema } from "./schemas";

export async function setChatName(
  name: string,
  myChatName: string | undefined,
  myMembers: Set<string>,
  channel: string,
  session: GraffitiSession,
) {
  if (!name.length || name === myChatName) return;
  await useGraffiti().put<ChatNameSchema>(
    {
      channels: [channel],
      value: {
        describes: channel,
        name,
        published: Date.now(),
      },
      allowed: [...myMembers],
    },
    session,
  );
}

export async function addMember(
  newMember: string,
  myMembers: Set<string>,
  channel: string,
  session: GraffitiSession,
) {
  if (!newMember.length) return;
  if (myMembers.has(newMember)) return;
  if (session.actor === newMember) return;
  await useGraffiti().put<MemberUpdateSchema>(
    {
      value: {
        activity: "Add",
        target: newMember,
        object: channel,
        published: Date.now(),
      },
      channels: [channel],
      allowed: [...myMembers, newMember],
    },
    session,
  );
}

export async function removeMember(
  member: string,
  myMembers: Set<string>,
  channel: string,
  session: GraffitiSession,
) {
  if (!myMembers.has(member)) return;
  await useGraffiti().put<MemberUpdateSchema>(
    {
      value: {
        activity: "Remove",
        target: member,
        object: channel,
        published: Date.now(),
      },
      channels: [channel],
      allowed: [...myMembers],
    },
    session,
  );
}
