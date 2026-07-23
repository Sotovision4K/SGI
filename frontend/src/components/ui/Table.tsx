import * as React from "react"
import { cn } from "../../lib/cn"

function Table({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table"
      className={cn("relative w-full overflow-auto", className)}
      {...props}
    />
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-header"
      className={cn(
        "border-b border-app-border bg-app-bg",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-row"
      className={cn(
        "border-b border-app-border transition-colors",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-head"
      className={cn(
        "h-10 px-4 text-left font-medium text-app-muted align-middle",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-cell"
      className={cn("px-4 py-3 align-middle", className)}
      {...props}
    />
  )
}

Table.displayName = "Table"
TableHeader.displayName = "TableHeader"
TableBody.displayName = "TableBody"
TableRow.displayName = "TableRow"
TableHead.displayName = "TableHead"
TableCell.displayName = "TableCell"

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }