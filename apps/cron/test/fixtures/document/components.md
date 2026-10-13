---
title: Sharing Data Between Screens
---

<Intro>

Screens often need the same piece of data. This page shows how to keep that data in one place and pass it down.

</Intro>

<YouWillLearn>

* How to lift data to a common parent
* How to pass data down with props

</YouWillLearn>

## Lift the data up {/*lift-the-data-up*/}

When two screens read the same value, move the value to their closest common parent. {/* TODO: add a picture */}

```jsx
<Profile>{/* children go here */}</Profile>
```

<Sandpack>

```js
export default function App() {
  return <Profile />
}
```

</Sandpack>

<Note>
Keep only one copy of each value. Two copies drift apart over time.
</Note>

<DeepDive>

#### Why not copy the data? {/*why-not-copy-the-data*/}

Copies look simple at first, but every update must reach both of them.

<Diagram name="copies" height={200} width={400} alt="Two copies of the same value" />

<Sandpack>

```js
const copy = { ...original }
```

</Sandpack>

</DeepDive>

<Pitfall>

Do not store a value that you can compute from other values. The text `{/* kept */}` in inline code stays.

</Pitfall>

<Illustration src="/images/lift.png" alt="Lifting the data" />

<Challenges>

#### Fix the counter {/*fix-the-counter*/}

This exercise text is removed together with the challenge.

</Challenges>

<Recap>

* Keep each value in one place.

</Recap>
