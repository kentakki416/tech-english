import { Href, Link } from "expo-router"
import { openBrowserAsync, WebBrowserPresentationStyle } from "expo-web-browser"
import { type ComponentProps } from "react"

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: Href & string }

export function ExternalLink({ href, ...rest }: Props) {
  return (
    <Link
      target="_blank"
      {...rest}
      href={href}
      onPress={async (event) => {
        if (process.env.EXPO_OS !== "web") {
          /**
           * native では既定のブラウザで開く動作を止めて、アプリ内ブラウザで開く
           */
          event.preventDefault()
          await openBrowserAsync(href, {
            presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
          })
        }
      }}
    />
  )
}
