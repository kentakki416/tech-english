"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import React, { useCallback, useEffect, useRef, useState } from "react"

import { AppLogo } from "@/components/layout/AppLogo"
import { useSidebar } from "@/features/sidebar/sidebar.context"
import {
  ChevronDownIcon,
  DocsIcon,
  FolderIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  UserCircleIcon,
} from "@/icons"

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
}

/**
 * tech-english の管理画面だけを並べる。TailAdmin テンプレートの画面（/calendar・/ui/* など。デザインの参考）と
 * デザインモック（/mock）はメニューに出さず、URL を直接開いて見る
 */
const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "ダッシュボード",
    path: "/",
  },
  {
    icon: <DocsIcon />,
    name: "問題",
    path: "/passages",
  },
  {
    icon: <FolderIcon />,
    name: "ソース",
    path: "/content-sources",
  },
  {
    icon: <ListIcon />,
    name: "タグ",
    path: "/tags",
  },
  {
    icon: <UserCircleIcon />,
    name: "ユーザー",
    path: "/users",
  },
]

/**
 * メニューに無い下の階層のページを、対応するメニューに寄せる（問題の分析はダッシュボードから開く）
 */
const MENU_PATH_ALIASES: { menuPath: string, prefix: string }[] = [{ menuPath: "/", prefix: "/analytics/" }]

/**
 * 開いているサブメニューの navItems の位置
 */
type SubmenuState = number | null

/**
 * メニューのすべてのリンク先
 */
const MENU_PATHS = navItems.flatMap((nav) => [
  ...(nav.path ? [nav.path] : []),
  ...(nav.subItems?.map((subItem) => subItem.path) ?? []),
])

/**
 * 今のページに対応するメニューのリンク先。下の階層のページ（/content-sources/new など）は、前方一致するうち最も長いものにする
 * （`/` は `${path}/` の前方一致が `//` になるので、完全一致のときだけ当たる）。MENU_PATH_ALIASES のページはその寄せ先
 */
const findActiveMenuPath = (pathname: string): string | null =>
  MENU_PATH_ALIASES.find((alias) => pathname.startsWith(alias.prefix))?.menuPath
  ?? MENU_PATHS
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .reduce<string | null>((longest, path) => (longest === null || path.length > longest.length ? path : longest), null)

const findSubmenuByPathname = (pathname: string): SubmenuState => {
  const activePath = findActiveMenuPath(pathname)
  const index = navItems.findIndex((nav) => nav.subItems?.some((subItem) => subItem.path === activePath))
  return index === -1 ? null : index
}

export default function AppSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar()
  const pathname = usePathname()

  const renderMenuItems = () => (
    <ul className="flex flex-col gap-4">
      {navItems.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index)}
              className={`menu-item group  ${
                openSubmenu === index
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
                  openSubmenu === index
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
                    openSubmenu === index
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
                subMenuRefs.current[index] = el
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu === index
                    ? `${subMenuHeight[index]}px`
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
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            pro
                          </span>
                        )}
                      </span>
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
  const [subMenuHeight, setSubMenuHeight] = useState<Record<number, number>>(
    {}
  )
  const subMenuRefs = useRef<Record<number, HTMLDivElement | null>>({})

  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOpenSubmenu(findSubmenuByPathname(pathname))
  }

  useEffect(() => {
    // Set the height of the submenu items when the submenu is opened
    if (openSubmenu !== null) {
      if (subMenuRefs.current[openSubmenu]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [openSubmenu]: subMenuRefs.current[openSubmenu]?.scrollHeight || 0,
        }))
      }
    }
  }, [openSubmenu])

  const handleSubmenuToggle = (index: number) => {
    setOpenSubmenu((prevOpenSubmenu) => (prevOpenSubmenu === index ? null : index))
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
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems()}
            </div>
          </div>
        </nav>
      </div>
    </aside>
  )
}
