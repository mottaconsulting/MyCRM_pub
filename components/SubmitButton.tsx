"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that shows an inline spinner and disables itself while its
 * form's server action is running. Must be rendered inside a <form>.
 */
export function SubmitButton({
  children,
  className,
  pendingText,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-progress disabled:opacity-80`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="crm-spinner" aria-hidden="true" />
          {pendingText ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
