# Borrowing Without Fear

This chapter explains how a program can lend a value to a function without giving it away.

## What Is Borrowing?

A borrow is a temporary view of a value. The owner keeps the value, and the borrower must give it back before the owner changes it.

### Shared and Exclusive Borrows

Many readers can look at a value at the same time, but only one writer can change it.

#### A Small Example

The compiler checks every borrow before the program runs.

```rust
let name = String::from("Ferris");
let length = measure(&name);
```

## Common Mistakes

Returning a borrow of a local value is a frequent mistake, because the value disappears when the function ends.
