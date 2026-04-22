// Throwaway test bench for code review skill.
// Intentional issues at known line numbers for end-to-end PR comment tests.

export function add(a: number, b: number): number {
  return a + b;
}

export function divide(a: number, b: number): number {
  return a / b;
}

export function getUser(id: any) {
  if (id == null) {
    return null;
  }
  const user = users.find(u => u.id == id);
  return user;
}

export const users = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
  { id: 3, name: 'Gamma' },
];

export class Counter {
  count = 0;

  increment() {
    this.count = this.count + 1;
  }

  decrement() {
    this.count = this.count - 1;
  }
}

export const SAMPLE_RATE = 0.1;
