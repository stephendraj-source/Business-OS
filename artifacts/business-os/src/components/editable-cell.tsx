import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useOptimisticUpdateProcess } from '@/hooks/use-app-data';

interface EditableCellProps {
  processId: number;
  field: string;
  initialValue: string | null;
  multiline?: boolean;
  onSaved?: (oldValue: string, newValue: string) => void;
  displayClassName?: string;
  alwaysExpanded?: boolean;
}

export function EditableCell({ processId, field, initialValue, multiline = false, onSaved, displayClassName, alwaysExpanded = false }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue || "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const { mutate: updateProcess } = useOptimisticUpdateProcess();

  // Sync local state if external data changes (and we aren't editing)
  useEffect(() => {
    if (!isEditing) {
      setValue(initialValue || "");
    }
  }, [initialValue, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Move cursor to end
      const length = inputRef.current.value.length;
      inputRef.current.setSelectionRange(length, length);
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    if (value !== (initialValue || "")) {
      const old = initialValue || "";
      updateProcess({ id: processId, data: { [field]: value } });
      onSaved?.(old, value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setValue(initialValue || "");
      setIsEditing(false);
    }
  };

  if (isEditing) {
    const commonClasses = "w-full min-w-[150px] min-h-[40px] bg-secondary/50 border-primary focus:border-primary focus:ring-1 focus:ring-primary/50 text-foreground text-sm p-2 outline-none rounded-none transition-all shadow-inner";
    
    return multiline ? (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={cn(commonClasses, "resize-y h-auto")}
        rows={3}
      />
    ) : (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={commonClasses}
      />
    );
  }

  return (
    <div 
      className="min-h-[40px] h-full w-full p-3 cursor-text group relative hover:bg-muted/50 transition-colors"
      onClick={() => setIsEditing(true)}
    >
      <span className={cn("overflow-hidden text-ellipsis text-sm text-foreground/90", !alwaysExpanded && "line-clamp-3")}>
        {value
          ? <span className={cn(displayClassName, alwaysExpanded && "block whitespace-pre-wrap break-words")}>{value}</span>
          : <span className={cn("text-muted-foreground italic", displayClassName)}>Empty</span>}
      </span>
      <div className="absolute inset-0 border border-transparent group-hover:border-primary/30 pointer-events-none transition-colors" />
    </div>
  );
}
