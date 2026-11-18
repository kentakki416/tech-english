import { ReactNode } from "react"

interface TableProps {
  children: ReactNode;
  className?: string;
}

interface TableHeaderProps {
  children: ReactNode;
  className?: string;
}

interface TableBodyProps {
  children: ReactNode;
  className?: string;
}

interface TableRowProps {
  children: ReactNode;
  className?: string;
}

interface TableCellProps {
  children: ReactNode;
  isHeader?: boolean;
  className?: string;
}

function Table({ children, className }: TableProps) {
  return <table className={`min-w-full  ${className}`}>{children}</table>
}

function TableHeader({ children, className }: TableHeaderProps) {
  return <thead className={className}>{children}</thead>
}

function TableBody({ children, className }: TableBodyProps) {
  return <tbody className={className}>{children}</tbody>
}

function TableRow({ children, className }: TableRowProps) {
  return <tr className={className}>{children}</tr>
}

function TableCell({
  children,
  isHeader = false,
  className,
}: TableCellProps) {
  const CellTag = isHeader ? "th" : "td"
  return <CellTag className={` ${className}`}>{children}</CellTag>
}

export { Table, TableHeader, TableBody, TableRow, TableCell }
export { default as DataTable } from "./DataTable"
export type { Column, FilterConfig } from "./DataTable"
