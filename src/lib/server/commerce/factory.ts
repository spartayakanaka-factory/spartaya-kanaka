import "server-only";
import { demand } from "@/lib/commerce/policy";
import { staff } from "./admin";
import { event, lockOrder, transaction } from "./store";
export async function addOrderNote(
  adminId: string,
  orderId: string,
  kind: "INTERNAL" | "MANUFACTURING",
  text: string,
  key: string,
) {
  demand(
    text.trim().length >= 2 && text.length <= 1500 && /^[A-Za-z0-9_-]{8,64}$/.test(key),
    "INVALID_NOTE",
    400,
  );
  return transaction(async (tx) => {
    await staff(adminId, tx);
    await lockOrder(tx, orderId);
    const old = await tx.commerceOrderNote.findUnique({ where: { requestKey: key } });
    if (old) {
      demand(
        old.orderId === orderId &&
          old.authorId === adminId &&
          old.kind === kind &&
          old.text === text.trim(),
        "IDEMPOTENCY_CONFLICT",
      );
      return old;
    }
    const note = await tx.commerceOrderNote.create({
      data: { orderId, authorId: adminId, kind, text: text.trim(), requestKey: key },
    });
    await event(tx, orderId, "staff:" + adminId, "order.note_added", "note:" + note.id, {
      noteId: note.id,
      kind,
    });
    return note;
  });
}
export async function setCustomerAccess(
  adminId: string,
  userId: string,
  banned: boolean,
  reason: string,
  key: string,
) {
  demand(
    reason.trim().length >= 8 && reason.length <= 500 && /^[A-Za-z0-9_-]{8,64}$/.test(key),
    "INVALID_INPUT",
    400,
  );
  return transaction(async (tx) => {
    const actor = await staff(adminId, tx);
    demand(actor.roleCode === "OWNER", "OWNER_REQUIRED", 403);
    const existing = await tx.commerceEvent.findUnique({
      where: { operationKey: "customer-access:" + key },
    });
    if (existing) {
      const data = existing.data as { userId: string; banned: boolean; reason: string };
      demand(
        data.userId === userId &&
          data.banned === banned &&
          data.reason === reason.trim() &&
          existing.actorKey === "staff:" + adminId,
        "IDEMPOTENCY_CONFLICT",
      );
      return { ok: true };
    }
    await tx.customerUser.update({ where: { id: userId }, data: { banned } });
    if (banned) await tx.customerSession.deleteMany({ where: { userId } });
    await tx.commerceEvent.create({
      data: {
        actorKey: "staff:" + adminId,
        kind: "customer.access_changed",
        operationKey: "customer-access:" + key,
        data: { userId, banned, reason: reason.trim() },
      },
    });
    return { ok: true };
  });
}
