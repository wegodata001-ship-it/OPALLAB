import type { User } from "@/lib/types";

export function calculateEmployeePay(user: User, hoursWorked: number): number | null {
  const type = user.salaryType ?? "MONTHLY";
  if (type === "HOURLY" && user.hourlyRate != null) {
    return Math.round(hoursWorked * user.hourlyRate * 100) / 100;
  }
  if (user.salary != null) return user.salary;
  return null;
}

export function getSalaryLabel(user: User): string {
  const type = user.salaryType ?? "MONTHLY";
  if (type === "HOURLY") {
    return user.hourlyRate != null ? `שעתי — ₪${user.hourlyRate}/שעה` : "שעתי — לא הוגדר";
  }
  return user.salary != null ? `גלובלי — ₪${user.salary}/חודש` : "גלובלי — לא הוגדר";
}
