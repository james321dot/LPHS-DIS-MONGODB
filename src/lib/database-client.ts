import type { AttendanceEntry } from "./attendance";
import type { RosterMember } from "./roster";
import {
  clearScanEventsFn,
  getAttendanceFn,
  getRosterFn,
  getScanEventsFn,
  mongoPingFn,
  publishRosterFn,
  pushAttendanceFn,
  pushScanEventFn,
  removeAttendanceFn,
} from "./database.server";

import type { ScanEvent, ScanResult } from "./scan-events";
export type { ScanEvent, ScanResult } from "./scan-events";

const SESSION_KEY = "lphs_mongodb_session_v1";
const POLL_MS = 2000;

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SESSION_KEY);
}

export async function signInWithStaffToken(token: string): Promise<void> {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, token);
  await mongoPingFn({ data: { token } });
}

export async function signOutStaff(): Promise<void> {
  if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_KEY);
}

export async function waitForSignedInUser(timeoutMs = 15000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const token = getToken();
    if (token) {
      try {
        await mongoPingFn({ data: { token } });
        return token;
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("MongoDB authentication timed out");
}

export async function subscribeToAuthState(
  callback: (uid: string | null) => void,
): Promise<() => void> {
  const token = getToken();
  callback(token);
  return () => undefined;
}

export async function subscribeAttendance(
  callback: (entries: AttendanceEntry[]) => void,
): Promise<() => void> {
  const token = getToken();
  if (!token) throw new Error("Authentication required");
  let active = true;
  let last = "";
  const poll = async () => {
    try {
      const list = await getAttendanceFn({ data: { token } });
      const signature = JSON.stringify(list);
      if (signature !== last) {
        last = signature;
        if (active) callback(list);
      }
    } catch (error) {
      console.error("[MongoDB] ATTENDANCE READ FAILED:", error);
    }
  };
  await poll();
  const timer = window.setInterval(() => void poll(), POLL_MS);
  return () => {
    active = false;
    window.clearInterval(timer);
  };
}

export async function pushAttendance(entry: Omit<AttendanceEntry, "id">) {
  const token = getToken();
  if (!token) throw new Error("Authentication required");
  return pushAttendanceFn({ data: { token, entry } });
}

export async function removeAttendance(id: string) {
  const token = getToken();
  if (!token) throw new Error("Authentication required");
  return removeAttendanceFn({ data: { token, id } });
}

export async function subscribeRoster(
  callback: (list: RosterMember[]) => void,
): Promise<() => void> {
  const token = getToken();
  if (!token) throw new Error("Authentication required");
  let active = true;
  let last = "";
  const poll = async () => {
    try {
      const list = await getRosterFn({ data: { token } });
      const signature = JSON.stringify(list);
      if (signature !== last) {
        last = signature;
        if (active) callback(list);
      }
    } catch (error) {
      console.error("[MongoDB] ROSTER READ FAILED:", error);
    }
  };
  await poll();
  const timer = window.setInterval(() => void poll(), POLL_MS);
  return () => {
    active = false;
    window.clearInterval(timer);
  };
}

export async function publishRoster(list: RosterMember[]) {
  const token = getToken();
  if (!token) throw new Error("Authentication required");
  return publishRosterFn({ data: { token, list } });
}

export async function subscribeScanEvents(
  callback: (events: ScanEvent[]) => void,
): Promise<() => void> {
  const token = getToken();
  if (!token) throw new Error("Authentication required");
  let active = true;
  let last = "";
  const poll = async () => {
    try {
      const list = await getScanEventsFn({ data: { token } });
      const signature = JSON.stringify(list);
      if (signature !== last) {
        last = signature;
        if (active) callback(list);
      }
    } catch (error) {
      console.error("[MongoDB] SCAN EVENT READ FAILED:", error);
    }
  };
  await poll();
  const timer = window.setInterval(() => void poll(), POLL_MS);
  return () => {
    active = false;
    window.clearInterval(timer);
  };
}

export async function pushScanEvent(event: Omit<ScanEvent, "id">) {
  const token = getToken();
  if (!token) throw new Error("Authentication required");
  return pushScanEventFn({ data: { token, event } });
}

export async function clearScanEvents() {
  const token = getToken();
  if (!token) throw new Error("Authentication required");
  return clearScanEventsFn({ data: { token } });
}
