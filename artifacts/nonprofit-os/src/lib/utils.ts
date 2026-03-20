import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCategoryColorClass(categoryName: string): string {
  const lower = categoryName.toLowerCase();
  if (lower.includes('strategy')) return 'cat-strategy';
  if (lower.includes('fundraising')) return 'cat-fundraising';
  if (lower.includes('grant')) return 'cat-grant';
  if (lower.includes('marketing')) return 'cat-marketing';
  if (lower.includes('program')) return 'cat-program';
  if (lower.includes('finance')) return 'cat-finance';
  if (lower.includes('hr') || lower.includes('talent')) return 'cat-hr';
  if (lower.includes('technology') || lower.includes('data')) return 'cat-tech';
  return 'cat-default';
}
