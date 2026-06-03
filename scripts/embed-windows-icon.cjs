const fs = require('fs');
const path = require('path');
const rcedit = require('rcedit');

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
}

function buildVersionStrings(packageJson, productName, exeFileName) {
  const versionStrings = {
    FileDescription: packageJson.description || productName,
    ProductName: productName,
    InternalName: path.basename(exeFileName, '.exe'),
    OriginalFilename: exeFileName,
  };

  if (packageJson.author) {
    versionStrings.CompanyName = packageJson.author;
  }

  return versionStrings;
}

module.exports = async function embedWindowsIcon(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const projectDir = context.packager.projectDir;
  const packageJsonPath = path.join(projectDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const productName = context.packager.appInfo.productName || packageJson.name;
  const exeFileName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeFileName);
  const iconPath = path.join(projectDir, 'public', 'favicon.ico');

  assertFileExists(exePath, 'Windows executable');
  assertFileExists(iconPath, 'Windows icon');

  await rcedit(exePath, {
    icon: iconPath,
    'file-version': packageJson.version,
    'product-version': packageJson.version,
    'version-string': buildVersionStrings(packageJson, productName, exeFileName),
  });

  console.log(JSON.stringify({
    embeddedWindowsIcon: path.relative(projectDir, exePath),
    icon: path.relative(projectDir, iconPath),
  }, null, 2));
};
