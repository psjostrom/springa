import React from "react";
import "@testing-library/jest-dom/vitest";
import { vi, beforeEach } from "vitest";

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
  useSession: () => ({ data: { user: { email: "test@example.com" } }, status: "authenticated" }),
  signOut: vi.fn(),
  SessionProvider: ({ children }: React.PropsWithChildren) => children,
}));

// --- Recharts mock ---
// jsdom can't measure SVG layout; mock all Recharts components
vi.mock("recharts", () => {
  function createMock(name: string) {
    const Mock = React.forwardRef(function MockComponent(
      { children, ...props }: React.PropsWithChildren<Record<string, unknown>>,
      ref: React.Ref<HTMLDivElement>,
    ) {
      return React.createElement("div", { "data-testid": `mock-${name}`, ref, ...props }, children);
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
    Tooltip: createMock("Tooltip"),
    Cell: createMock("Cell"),
    ReferenceLine: createMock("ReferenceLine"),
  };
});

// --- lucide-react mock ---
// lucide icons use SVG which can cause issues in jsdom; explicitly mock all used icons
vi.mock("lucide-react", () => {
  function icon(name: string) {
    function MockIcon(props: Record<string, unknown>) {
      return React.createElement("span", { "data-testid": `icon-${name}`, ...props });
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
  };
});

// --- window stubs ---
Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });

// --- localStorage mock ---
const localStorageMap = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { localStorageMap.set(key, value); },
  removeItem: (key: string) => { localStorageMap.delete(key); },
  clear: () => { localStorageMap.clear(); },
  get length() { return localStorageMap.size; },
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
