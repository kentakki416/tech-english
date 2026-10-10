/**
 * admin の画面で使う共通クラス。既存テンプレート（InputField / TextArea / Select / ComponentCard）と同じ見た目にそろえる
 *
 * デザインモック（`app/(dashboard)/mock/_components/ui.ts`）と同じ値。モックは本実装の後に消すので、本番の画面はこちらを使う
 */

export const cardClass = "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3"

export const cardBodyClass = "border-t border-gray-100 p-4 sm:p-6 dark:border-gray-800"

export const titleClass = "text-base font-medium text-gray-800 dark:text-white/90"

export const descClass = "mt-1 text-sm text-gray-500 dark:text-gray-400"

export const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"

export const hintClass = "mt-1.5 text-xs text-gray-500 dark:text-gray-400"

export const inputClass = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"

export const textareaClass = "w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"

export const selectClass = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"

export const primaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"

export const outlineButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-theme-xs ring-1 ring-gray-300 transition ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/3 dark:hover:text-gray-300"

export const dangerOutlineButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-error-600 shadow-theme-xs ring-1 ring-error-300 transition ring-inset hover:bg-error-50 dark:bg-gray-800 dark:text-error-500 dark:ring-error-500/40 dark:hover:bg-error-500/10"
