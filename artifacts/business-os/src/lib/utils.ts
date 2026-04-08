import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
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
