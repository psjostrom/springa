import React from "react";
import { vi, beforeEach, expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

// Manually extend expect with jest-dom matchers
expect.extend(matchers);

// --- next/navigation mock ---
export const mockPush = vi.fn();
export const mockReplace = vi.fn();
export const mockBack = vi.fn();
export const searchParamsState = { current: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => searchParamsState.current,
  usePathname: () => "/",
}));

// --- next-auth/react mock ---
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { email: "test@example.com" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
  SessionProvider: ({ children }: React.PropsWithChildren) => children,
}));

// --- Recharts mock ---
// jsdom can't measure SVG layout; mock all Recharts components.
// Only pass data-* and aria-* attrs to the div to avoid React unknown-prop warnings.
vi.mock("recharts", () => {
  function createMock(name: string) {
    const Mock = React.forwardRef(function MockComponent(
      { children, ...props }: React.PropsWithChildren<Record<string, unknown>>,
      ref: React.Ref<HTMLDivElement>,
    ) {
      const htmlProps: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        if (k.startsWith("data-") || k.startsWith("aria-")) htmlProps[k] = v;
      }
      return React.createElement(
        "div",
        { "data-testid": `mock-${name}`, ref, ...htmlProps },
        children,
      );
    });
    Mock.displayName = `Mock${name}`;
    return Mock;
  }
  return {
    ResponsiveContainer: createMock("ResponsiveContainer"),
    LineChart: createMock("LineChart"),
    BarChart: createMock("BarChart"),
    Line: createMock("Line"),
    Bar: createMock("Bar"),
    XAxis: createMock("XAxis"),
    YAxis: createMock("YAxis"),
    AreaChart: createMock("AreaChart"),
    Area: createMock("Area"),
    ReferenceLine: createMock("ReferenceLine"),
    ReferenceArea: createMock("ReferenceArea"),
    Tooltip: createMock("Tooltip"),
    Label: createMock("Label"),
    Cell: createMock("Cell"),
  };
});

// --- lucide-react mock ---
// lucide icons use SVG which can cause issues in jsdom; explicitly mock all used icons
vi.mock("lucide-react", () => {
  function icon(name: string) {
    function MockIcon(props: Record<string, unknown>) {
      return React.createElement("span", {
        "data-testid": `icon-${name}`,
        ...props,
      });
    }
    MockIcon.displayName = name;
    return MockIcon;
  }
  return {
    Loader2: icon("Loader2"),
    Settings: icon("Settings"),
    ChevronLeft: icon("ChevronLeft"),
    ChevronRight: icon("ChevronRight"),
    History: icon("History"),
    UploadCloud: icon("UploadCloud"),
    CheckCircle: icon("CheckCircle"),
    AlertTriangle: icon("AlertTriangle"),
    RotateCcw: icon("RotateCcw"),
    Key: icon("Key"),
    CalendarDays: icon("CalendarDays"),
    ClipboardList: icon("ClipboardList"),
    TrendingUp: icon("TrendingUp"),
    Route: icon("Route"),
    CalendarCheck: icon("CalendarCheck"),
    ChevronDown: icon("ChevronDown"),
    Info: icon("Info"),
    Pencil: icon("Pencil"),
    Sparkles: icon("Sparkles"),
    RefreshCw: icon("RefreshCw"),
    Droplets: icon("Droplets"),
    TrendingDown: icon("TrendingDown"),
    Heart: icon("Heart"),
    Activity: icon("Activity"),
    Moon: icon("Moon"),
    Zap: icon("Zap"),
    Gauge: icon("Gauge"),
    ChevronUp: icon("ChevronUp"),
    Eye: icon("Eye"),
    EyeOff: icon("EyeOff"),
    Check: icon("Check"),
    X: icon("X"),
    LogOut: icon("LogOut"),
    Bell: icon("Bell"),
    GripVertical: icon("GripVertical"),
    Lightbulb: icon("Lightbulb"),
    Flame: icon("Flame"),
    Footprints: icon("Footprints"),
    HeartPulse: icon("HeartPulse"),
    ArrowUpFromLine: icon("ArrowUpFromLine"),
    Utensils: icon("Utensils"),
    MessageSquare: icon("MessageSquare"),
    BarChart3: icon("BarChart3"),
    Clock: icon("Clock"),
    Monitor: icon("Monitor"),
    Bot: icon("Bot"),
    Layers: icon("Layers"),
    Beaker: icon("Beaker"),
    Send: icon("Send"),
    Plus: icon("Plus"),
    Timer: icon("Timer"),
    ExternalLink: icon("ExternalLink"),
    MapPin: icon("MapPin"),
  };
});

// --- window stubs ---
Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });

// --- localStorage mock ---
const localStorageMap = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageMap.set(key, value);
  },
  removeItem: (key: string) => {
    localStorageMap.delete(key);
  },
  clear: () => {
    localStorageMap.clear();
  },
  get length() {
    return localStorageMap.size;
  },
  key: (index: number) => Array.from(localStorageMap.keys())[index] ?? null,
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// --- Reset mocks between tests ---
beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
  searchParamsState.current = new URLSearchParams();
  localStorageMap.clear();
});
