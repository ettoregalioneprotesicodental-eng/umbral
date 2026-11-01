"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingText, className = "btn btn-primary btn-block", name, value }: { children: React.ReactNode; pendingText: string; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending} name={name} value={value} aria-busy={pending}>{pending ? pendingText : children}</button>;
}
