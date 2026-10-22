"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import React, { useCallback, useEffect, useRef, useState } from "react"

import { demoNavSection } from "@/components/demo/demo-nav-items"
import { AppLogo } from "@/components/layout/AppLogo"
import { mainNavSection, type NavItem, type NavSection } from "@/components/layout/nav-items"
import { useSidebar } from "@/features/sidebar/sidebar.context"
import {
  ChevronDownIcon,
  HorizontaLDots,
} from "@/icons"

const navSections: NavSection[] = [mainNavSection, demoNavSection]

/**
 * メニューに無い下の階層のページを、対応するメニューに寄せる（問題の分析はダッシュボードから開く）
 */
const MENU_PATH_ALIASES: { menuPath: string, prefix: string }[] = [{ menuPath: "/", prefix: "/analytics/" }]

type SubmenuState = { itemIndex: number, sectionIndex: number } | null

const MENU_PATHS = navSections.flatMap((section) =>
  section.items.flatMap((nav) => [
    ...(nav.path ? [nav.path] : []),
    ...(nav.subItems?.map((subItem) => subItem.path) ?? []),
  ]),
)

/**
 * 今のページに対応するメニューのリンク先。下の階層のページ（/sources/new など）は、前方一致するうち最も長いものにする
 * （`/` は `${path}/` の前方一致が `//` になるので、完全一致のときだけ当たる）。MENU_PATH_ALIASES のページはその寄せ先
 */
const findActiveMenuPath = (pathname: string): string | null =>
  MENU_PATH_ALIASES.find((alias) => pathname.startsWith(alias.prefix))?.menuPath
  ?? MENU_PATHS
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .reduce<string | null>((longest, path) => (longest === null || path.length > longest.length ? path : longest), null)

const findSubmenuByPathname = (pathname: string): SubmenuState => {
  const activePath = findActiveMenuPath(pathname)
  for (const [sectionIndex, section] of navSections.entries()) {
    const itemIndex = section.items.findIndex((nav) => nav.subItems?.some((subItem) => subItem.path === activePath))
    if (itemIndex !== -1) return { itemIndex, sectionIndex }
  }
  return null
}

const buildSubmenuKey = (sectionIndex: number, itemIndex: number): string => `${sectionIndex}-${itemIndex}`

export default function AppSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar()
  const pathname = usePathname()

  const isSubmenuOpen = (sectionIndex: number, itemIndex: number): boolean =>
    openSubmenu?.sectionIndex === sectionIndex && openSubmenu?.itemIndex === itemIndex

  const renderMenuItems = (items: NavItem[], sectionIndex: number) => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, itemIndex) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(sectionIndex, itemIndex)}
              className={`menu-item group  ${
                isSubmenuOpen(sectionIndex, itemIndex)
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={` ${
                  isSubmenuOpen(sectionIndex, itemIndex)
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className={"menu-item-text"}>{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200  ${
                    isSubmenuOpen(sectionIndex, itemIndex)
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className={"menu-item-text"}>{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[buildSubmenuKey(sectionIndex, itemIndex)] = el
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height: isSubmenuOpen(sectionIndex, itemIndex)
                  ? `${subMenuHeight[buildSubmenuKey(sectionIndex, itemIndex)]}px`
                  : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      href={subItem.path}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  )

  const activePath = findActiveMenuPath(pathname)
  const isActive = useCallback((path: string) => path === activePath, [activePath])

  const [openSubmenu, setOpenSubmenu] = useState<SubmenuState>(() =>
    findSubmenuByPathname(pathname)
  )
  const [prevPathname, setPrevPathname] = useState(pathname)
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  )
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({})

  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOpenSubmenu(findSubmenuByPathname(pathname))
  }

  useEffect(() => {
    /**
     * サブメニューを開いたときに、中身の高さを測って開閉のアニメーションに使う
     */
    if (openSubmenu !== null) {
      const key = buildSubmenuKey(openSubmenu.sectionIndex, openSubmenu.itemIndex)
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }))
      }
    }
  }, [openSubmenu])

  const handleSubmenuToggle = (sectionIndex: number, itemIndex: number) => {
    setOpenSubmenu((prevOpenSubmenu) =>
      prevOpenSubmenu?.sectionIndex === sectionIndex && prevOpenSubmenu.itemIndex === itemIndex
        ? null
        : { itemIndex, sectionIndex },
    )
  }

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
    isExpanded || isMobileOpen
      ? "w-[290px]"
      : isHovered
        ? "w-[290px]"
        : "w-[90px]"
    }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex  ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <AppLogo isCompact={!isExpanded && !isHovered && !isMobileOpen} />
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            {navSections.map((section, sectionIndex) => (
              <div key={section.title}>
                <h2
                  className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered
                      ? "lg:justify-center"
                      : "justify-start"
                  }`}
                >
                  {isExpanded || isHovered || isMobileOpen ? (
                    section.title
                  ) : (
                    <HorizontaLDots />
                  )}
                </h2>
                {renderMenuItems(section.items, sectionIndex)}
              </div>
            ))}
          </div>
        </nav>
      </div>
    </aside>
  )
}
