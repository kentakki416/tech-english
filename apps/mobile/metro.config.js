const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const fs = require('fs')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

/**
 * workspace のパッケージは projectRoot の外にあるので、monorepo 全体を監視する
 */
config.watchFolders = [monorepoRoot]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

config.resolver.unstable_conditionNames = ['react-native', 'require', 'default']

/**
 * pnpm の isolated な配置では node_modules/<pkg> が .pnpm への symlink なので、realpath にして、
 * パッケージ自身の依存（@react-native/assets-registry など）を実体の場所から解決できるようにする
 */
const singletonPkgs = {
  react: fs.realpathSync(path.resolve(projectRoot, 'node_modules/react')),
  'react-native': fs.realpathSync(path.resolve(projectRoot, 'node_modules/react-native')),
}

/**
 * react・react-native は、どのモジュールから require しても同じ実体のファイルに解決されるように、ファイルのパスをそのまま返す
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (singletonPkgs[moduleName]) {
    const pkgDir = singletonPkgs[moduleName]
    const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
    const mainFile = path.resolve(pkgDir, pkgJson.main || 'index.js')
    return {
      type: 'sourceFile',
      filePath: mainFile,
    }
  }

  for (const [pkg, pkgDir] of Object.entries(singletonPkgs)) {
    if (moduleName.startsWith(pkg + '/')) {
      const subpath = moduleName.slice(pkg.length + 1)
      const filePath = path.resolve(pkgDir, subpath)
      const candidates = [filePath, filePath + '.js', filePath + '.json']
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return {
            type: 'sourceFile',
            filePath: candidate,
          }
        }
      }
    }
  }

  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
