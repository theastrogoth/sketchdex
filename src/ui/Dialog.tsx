import { useEffect, useRef, type ReactNode } from 'react'

/** A modal dialog, shown while it is rendered. Closes on Escape and on a click outside it. */
export function Dialog({ label, onClose, children }: { label: string; onClose(): void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-label={label}
      // Escape cancels the dialog. Its `close` event is not listened to: closing it
      // on unmount fires that too, which in development, where effects are run
      // twice, would dismiss the dialog as soon as it opened.
      onCancel={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === dialog.current) onClose()
      }}
    >
      <div className="dialog-body">{children}</div>
    </dialog>
  )
}
