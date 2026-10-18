import { Metadata } from "next"
import React from "react"

import DefaultModal from "@/components/demo/example/ModalExample/DefaultModal"
import FormInModal from "@/components/demo/example/ModalExample/FormInModal"
import FullScreenModal from "@/components/demo/example/ModalExample/FullScreenModal"
import ModalBasedAlerts from "@/components/demo/example/ModalExample/ModalBasedAlerts"
import VerticallyCenteredModal from "@/components/demo/example/ModalExample/VerticallyCenteredModal"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

export const metadata: Metadata = {
  title: "Modals",
}

export default function Modals() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Modals" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:gap-6">
        <DefaultModal />
        <VerticallyCenteredModal />
        <FormInModal />
        <FullScreenModal />
        <ModalBasedAlerts />
      </div>
    </div>
  )
}
