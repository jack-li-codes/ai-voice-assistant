"use client";

import { useEffect, useMemo, useState } from "react";

type MicDevice = { deviceId: string; label: string };

const STORAGE_KEY = "preferred_mic_device_id";

function isSecureContextOk() {
  return typeof window !== "undefined" && (window.isSecureContext || location.hostname === "localhost");
}

export default function MicSelector(props: {
  className?: string;
  onSelected?: (deviceId: string | null) => void;
}) {
  const { className, onSelected } = props;

  const [mics, setMics] = useState<MicDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [defaultLabel, setDefaultLabel] = useState<string>("");
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState<string>("");

  const canEnumerate = useMemo(() => typeof navigator !== "undefined" && !!navigator.mediaDevices?.enumerateDevices, []);
  const canGUM = useMemo(() => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia, []);

  async function ensurePermissionAndLabels() {
    // Without permission, device labels are often empty.
    if (!canGUM) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermission("granted");
    } catch (e) {
      setPermission("denied");
    }
  }

  async function loadMics() {
    if (!canEnumerate) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = list
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || "(Microphone — permission required to show name)",
      }));
    setMics(audioInputs);

    // Capture the default device label
    const defaultDevice = list.find((d) => d.kind === "audioinput" && d.deviceId === "default");
    if (defaultDevice) {
      setDefaultLabel(defaultDevice.label || "(Permission required to show name)");
    }
  }

  async function init() {
    // restore selection
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    setSelectedId(saved || null);

    // ask permission once to get labels (best effort)
    await ensurePermissionAndLabels();
    await loadMics();
  }

  useEffect(() => {
    init();

    if (!navigator?.mediaDevices?.addEventListener) return;
    const handler = async () => {
      // device plugged/unplugged
      await loadMics();
    };
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onSelected?.(selectedId);
    if (typeof window !== "undefined") {
      if (selectedId) localStorage.setItem(STORAGE_KEY, selectedId);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, [selectedId, onSelected]);

  async function testMic(deviceId: string | null) {
    if (!deviceId) return;
    if (!isSecureContextOk()) {
      setTestStatus("fail");
      setTestMsg("Mic test requires HTTPS (or localhost).");
      return;
    }
    if (!canGUM) {
      setTestStatus("fail");
      setTestMsg("getUserMedia not supported in this browser.");
      return;
    }

    setTestStatus("testing");
    setTestMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });
      stream.getTracks().forEach((t) => t.stop());
      setTestStatus("ok");
      setTestMsg("Mic opened successfully (device is usable).");
    } catch (e: any) {
      setTestStatus("fail");
      setTestMsg(e?.message || "Failed to open selected mic.");
    }
  }

  return (
    <div className={className}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontWeight: 600 }}>Microphone</label>

        <select
          value={selectedId ?? ""}
          onChange={(e) => {
            const v = e.target.value || null;
            setSelectedId(v);
            setTestStatus("idle");
            setTestMsg("");
          }}
          style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc", minWidth: 260 }}
        >
          <option value="">(Default / Browser-selected)</option>
          {mics.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => testMic(selectedId)}
          disabled={!selectedId || testStatus === "testing"}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
        >
          {testStatus === "testing" ? "Testing..." : "Test"}
        </button>

        <span style={{ fontSize: 12, opacity: 0.8 }}>
          {permission === "denied" ? "Mic permission denied (device names may be hidden)." : ""}
        </span>
      </div>

      {defaultLabel && (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
          Current default (browser-selected): {defaultLabel}
        </div>
      )}

      {testMsg ? (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          {testStatus === "ok" ? "✅ " : testStatus === "fail" ? "❌ " : ""}
          {testMsg}
        </div>
      ) : null}

      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
        Note: WebSpeech may still follow the browser's site microphone permission. If recognition uses a virtual mic,
        change the mic in the browser 🔒 site settings, then refresh.
      </div>
    </div>
  );
}
