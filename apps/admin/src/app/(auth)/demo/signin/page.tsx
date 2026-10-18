import { Metadata } from "next"

import SignInForm from "@/components/demo/auth/SignInForm"

export const metadata: Metadata = {
  title: "Sign In",
}

export default function SignIn() {
  return <SignInForm />
}
