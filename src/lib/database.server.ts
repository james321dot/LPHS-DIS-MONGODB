import { createServerFn } from "@tanstack/react-start";
import { MongoClient, ServerApiVersion, type Document } from "mongodb";
import type { AttendanceEntry } from "./attendance";
import type { RosterMember } from "./roster";
import type { ScanEvent } from "./scan-events";
import { requireRole, requireSession } from "./session.server";

let clientPromise: Promise<MongoClient> | undefined;

function mongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI is not configured");
  return uri;
}

function databaseName(): string {
  return process.env.MONGODB_DB?.trim() || "LPHS-DIS";
}

async function getDb() {
  if (!clientPromise) {
    const client = new MongoClient(mongoUri(), {
      appName: process.env.APP_NAME || "LPHS DIS",
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    clientPromise = client.connect();
  }
  const client = await clientPromise;
  return client.db(databaseName());
}

function clean<T extends Document>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc as T & { _id?: unknown; id?: unknown };
  const existingId = typeof rest.id === "string" ? rest.id : undefined;
  return { ...rest, id: existingId ?? String(_id) } as Omit<T, "_id"> & { id: string };
}

export const getAttendanceFn = createServerFn({ method: "POST" })
  .validator((data: { token?: string }) => data ?? {})
  .handler(async ({ data }) => {
    await requireSession(data.token);
    const db = await getDb();
    const docs = await db
      .collection("attendance")
      .find({})
      .sort({ timestamp: -1 })
      .toArray();
    return docs.map((doc) => clean(doc) as unknown as AttendanceEntry);
  });

export const pushAttendanceFn = createServerFn({ method: "POST" })
  .validator((data: { token?: string; entry: Omit<AttendanceEntry, "id"> }) => data)
  .handler(async ({ data }) => {
    const session = await requireRole(data.token, ["Guard", "Admin", "Dev"]);
    const entry = {
      ...data.entry,
      guard: data.entry.guard || session.badge,
    };
    const db = await getDb();
    const result = await db.collection("attendance").insertOne(entry);
    return { id: result.insertedId.toString() };
  });

export const removeAttendanceFn = createServerFn({ method: "POST" })
  .validator((data: { token?: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireRole(data.token, ["Admin", "Dev"]);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");
    if (!ObjectId.isValid(data.id)) throw new Error("Invalid attendance id");
    await db.collection("attendance").deleteOne({ _id: new ObjectId(data.id) });
    return { ok: true };
  });

export const getRosterFn = createServerFn({ method: "POST" })
  .validator((data: { token?: string }) => data ?? {})
  .handler(async ({ data }) => {
    await requireSession(data.token);
    const db = await getDb();
    const docs = await db.collection("roster").find({}).sort({ name: 1 }).toArray();
    return docs.map((doc) => clean(doc) as unknown as RosterMember);
  });

export const publishRosterFn = createServerFn({ method: "POST" })
  .validator((data: { token?: string; list: RosterMember[] }) => data)
  .handler(async ({ data }) => {
    await requireRole(data.token, ["Admin", "Dev"]);
    const db = await getDb();
    const collection = db.collection("roster");
    await collection.deleteMany({});
    if (data.list.length) {
      await collection.insertMany(
        data.list.map((member) => ({
          id: member.id,
          name: member.name,
          role: member.role,
          ...(member.gradeLevel ? { gradeLevel: member.gradeLevel } : {}),
          ...(member.section ? { section: member.section } : {}),
        })),
      );
    }
    return { ok: true };
  });

export const getScanEventsFn = createServerFn({ method: "POST" })
  .validator((data: { token?: string }) => data ?? {})
  .handler(async ({ data }) => {
    await requireSession(data.token);
    const db = await getDb();
    const docs = await db
      .collection("scanEvents")
      .find({})
      .sort({ timestamp: -1 })
      .limit(500)
      .toArray();
    return docs.map((doc) => clean(doc) as unknown as ScanEvent);
  });

export const pushScanEventFn = createServerFn({ method: "POST" })
  .validator((data: { token?: string; event: Omit<ScanEvent, "id"> }) => data)
  .handler(async ({ data }) => {
    await requireRole(data.token, ["Guard", "Admin", "Dev"]);
    const db = await getDb();
    const result = await db.collection("scanEvents").insertOne(data.event);
    // Keep the collection bounded, matching the previous 500-event limit.
    const count = await db.collection("scanEvents").countDocuments();
    if (count > 500) {
      const excess = count - 500;
      const old = await db
        .collection("scanEvents")
        .find({}, { projection: { _id: 1 } })
        .sort({ timestamp: 1 })
        .limit(excess)
        .toArray();
      if (old.length) await db.collection("scanEvents").deleteMany({ _id: { $in: old.map((d) => d._id) } });
    }
    return { id: result.insertedId.toString() };
  });

export const clearScanEventsFn = createServerFn({ method: "POST" })
  .validator((data: { token?: string }) => data ?? {})
  .handler(async ({ data }) => {
    await requireRole(data.token, ["Admin", "Dev"]);
    const db = await getDb();
    await db.collection("scanEvents").deleteMany({});
    return { ok: true };
  });

export const mongoPingFn = createServerFn({ method: "POST" })
  .validator((data: { token?: string }) => data ?? {})
  .handler(async ({ data }) => {
    await requireSession(data.token);
    const db = await getDb();
    await db.command({ ping: 1 });
    return { ok: true, database: databaseName() };
  });
