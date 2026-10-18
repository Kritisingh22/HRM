/* ============================================================
   Lookups — id → human label resolvers and team scoping shared
   by the feature pages.
   ============================================================ */
import type { Department, Employee } from '@/types';

export function deptName(departments: Department[], id?: string | null): string {
  if (!id) return '—';
  return departments.find((d) => d.id === id)?.name ?? id;
}

export function empName(employees: Employee[], id?: string | null): string {
  if (!id) return '—';
  return employees.find((e) => e.id === id)?.name ?? id;
}

/** `Rahul Mehta · CY0415RM113` — used in dense tables and detail rows. */
export function empLabel(employees: Employee[], id?: string | null): string {
  if (!id) return '—';
  const e = employees.find((x) => x.id === id);
  return e ? `${e.name} · ${e.id}` : id;
}

export function empById(employees: Employee[], id?: string | null): Employee | null {
  if (!id) return null;
  return employees.find((e) => e.id === id) ?? null;
}

/** The signed-in employee's team: everyone reachable through `manager`, plus self. */
export function teamIds(employees: Employee[], managerId: string): Set<string> {
  const ids = new Set<string>([managerId]);
  const walk = (id: string) => {
    employees.forEach((e) => {
      if (e.manager === id && !ids.has(e.id)) {
        ids.add(e.id);
        walk(e.id);
      }
    });
  };
  walk(managerId);
  return ids;
}
