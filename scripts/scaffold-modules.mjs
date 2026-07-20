import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'apps', 'api', 'src');

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function write(path, content) {
  ensureDir(dirname(path));
  writeFileSync(path, content, 'utf8');
}
 
function pascalCase(str) {
  return str
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function camelCase(str) {
  const p = pascalCase(str);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function serviceTemplate(className) {
  return `import { Injectable } from '@nestjs/common';

@Injectable()
export class ${className} {}
`;
}

function controllerTemplate(className, route, serviceName, serviceClass) {
  return `import { Controller } from '@nestjs/common';
import { ${serviceClass} } from './${serviceName}';

@Controller('${route}')
export class ${className} {
  constructor(private readonly ${camelCase(serviceClass.replace('Service', ''))}Service: ${serviceClass}) {}
}
`;
}

function moduleTemplate(
  moduleClass,
  imports,
  controllers,
  providers,
  exports = [],
) {
  const controllerImports = controllers
    .map((c) => `import { ${c.class} } from './${c.file}';`)
    .join('\n');
  const providerImports = providers
    .filter((p) => !controllers.find((c) => c.class === p.class))
    .map((p) => `import { ${p.class} } from './${p.file}';`)
    .join('\n');
  const allImports = [controllerImports, providerImports]
    .filter(Boolean)
    .join('\n');

  return `import { Module } from '@nestjs/common';
${allImports ? allImports + '\n' : ''}
@Module({
  imports: [${imports.join(', ')}],
  controllers: [${controllers.map((c) => c.class).join(', ')}],
  providers: [${providers.map((p) => p.class).join(', ')}],
  exports: [${exports.length ? exports.join(', ') : providers.map((p) => p.class).join(', ')}],
})
export class ${moduleClass} {}
`;
}

function standardModule(basePath, name, options = {}) {
  const {
    route = name,
    controllers = [{ name, route }],
    extraProviders = [],
    subPath = '',
    exports = [],
  } = options;

  const dir = join(SRC, basePath, subPath);
  const serviceClass = `${pascalCase(name)}Service`;
  const serviceFile = subPath
    ? join('..', `${name}.service`).replace(/\\/g, '/')
    : `${name}.service`;

  const mainServicePath = subPath
    ? join(SRC, basePath, `${name}.service.ts`)
    : join(dir, `${name}.service.ts`);

  if (!subPath) {
    write(mainServicePath, serviceTemplate(serviceClass));
    write(join(dir, 'dto', '.gitkeep'), '');
  }

  const controllerEntries = [];
  const providerEntries = [{ class: serviceClass, file: `${name}.service` }];

  for (const ctrl of controllers) {
    const ctrlName = ctrl.name;
    const ctrlClass = `${pascalCase(ctrlName)}Controller`;
    const ctrlRoute = ctrl.route ?? ctrlName;
    const ctrlFile = `${ctrlName}.controller`;
    const ctrlPath = join(dir, `${ctrlName}.controller.ts`);

    write(
      ctrlPath,
      controllerTemplate(ctrlClass, ctrlRoute, `${name}.service`, serviceClass),
    );
    controllerEntries.push({ class: ctrlClass, file: ctrlFile });
  }

  for (const provider of extraProviders) {
    const providerClass = `${pascalCase(provider)}Service`;
    write(join(dir, `${provider}.service.ts`), serviceTemplate(providerClass));
    providerEntries.push({ class: providerClass, file: `${provider}.service` });
  }

  const moduleClass = `${pascalCase(name)}Module`;
  const modulePath = join(SRC, basePath, `${name}.module.ts`);

  if (!subPath) {
    write(
      modulePath,
      moduleTemplate(
        moduleClass,
        [],
        controllerEntries,
        providerEntries,
        exports.length ? exports : [serviceClass],
      ),
    );
  }

  return { moduleClass, modulePath };
}

// Clinical submodules
const clinicalSubs = [
  'encounters',
  'diagnoses',
  'clinical-notes',
  'prescriptions',
  'referrals',
  'observations',
  'care-plans',
];

const clinicalControllers = [];
const clinicalProviders = [];

for (const sub of clinicalSubs) {
  const subDir = join(SRC, 'clinical', sub);
  const svcClass = `${pascalCase(sub)}Service`;
  const ctrlClass = `${pascalCase(sub)}Controller`;
  write(join(subDir, `${sub}.service.ts`), serviceTemplate(svcClass));
  write(
    join(subDir, `${sub}.controller.ts`),
    controllerTemplate(ctrlClass, sub, `${sub}.service`, svcClass),
  );
  clinicalControllers.push({ class: ctrlClass, file: `${sub}/${sub}.controller` });
  clinicalProviders.push({ class: svcClass, file: `${sub}/${sub}.service` });
}

write(
  join(SRC, 'clinical', 'clinical.module.ts'),
  `import { Module } from '@nestjs/common';
${clinicalControllers.map((c) => `import { ${c.class} } from './${c.file.replace('.controller', '')}';`).join('\n')}
${clinicalProviders.map((p) => `import { ${p.class} } from './${p.file.replace('.service', '')}';`).join('\n')}

@Module({
  controllers: [${clinicalControllers.map((c) => c.class).join(', ')}],
  providers: [${clinicalProviders.map((p) => p.class).join(', ')}],
  exports: [${clinicalProviders.map((p) => p.class).join(', ')}],
})
export class ClinicalModule {}
`,
);

// Standard single-controller modules
const simpleModules = [
  'users',
  'roles',
  'permissions',
  'patients',
  'records',
  'appointments',
  'nursing',
  'analytics',
  'icu',
  'queues',
  'discharge',
  'administration',
  'super-admin',
];

const createdModules = [];

for (const name of simpleModules) {
  standardModule(name, name);
  createdModules.push(`${pascalCase(name)}Module`);
}

// Auth with strategies and guards
const authDir = join(SRC, 'auth');
write(join(authDir, 'auth.service.ts'), serviceTemplate('AuthService'));
write(
  join(authDir, 'auth.controller.ts'),
  controllerTemplate('AuthController', 'auth', 'auth.service', 'AuthService'),
);
write(join(authDir, 'dto', '.gitkeep'), '');
write(
  join(authDir, 'strategies', 'jwt.strategy.ts'),
  `// JWT strategy — implement during auth module development
export {};
`,
);
write(
  join(authDir, 'strategies', 'local.strategy.ts'),
  `// Local strategy — implement during auth module development
export {};
`,
);
write(
  join(authDir, 'guards', 'jwt-auth.guard.ts'),
  `// JWT auth guard — implement during auth module development
export {};
`,
);
write(
  join(authDir, 'auth.module.ts'),
  moduleTemplate('AuthModule', [], [{ class: 'AuthController', file: 'auth.controller' }], [
    { class: 'AuthService', file: 'auth.service' },
  ]),
);
createdModules.push('AuthModule');

// Audit
standardModule('audit', 'audit');
createdModules.push('AuditModule');

// Multi-controller modules
const multiControllerModules = [
  {
    name: 'system-settings',
    controllers: [
      { name: 'departments', route: 'system-settings/departments' },
      { name: 'branches', route: 'system-settings/branches' },
      { name: 'service-types', route: 'system-settings/service-types' },
      { name: 'workflow-settings', route: 'system-settings/workflow-settings' },
    ],
  },
  {
    name: 'admissions',
    controllers: [
      { name: 'admissions', route: 'admissions' },
      { name: 'wards', route: 'admissions/wards' },
      { name: 'beds', route: 'admissions/beds' },
    ],
  },
  {
    name: 'psychiatry',
    controllers: [
      { name: 'psychiatric-opc', route: 'psychiatry/opc' },
      { name: 'psychology', route: 'psychiatry/psychology' },
      { name: 'child-adolescent', route: 'psychiatry/child-adolescent' },
      { name: 'addiction-rehab', route: 'psychiatry/addiction-rehab' },
      { name: 'psychogeriatrics', route: 'psychiatry/psychogeriatrics' },
    ],
  },
  {
    name: 'allied-health',
    controllers: [
      { name: 'physiotherapy', route: 'allied-health/physiotherapy' },
      { name: 'speech-therapy', route: 'allied-health/speech-therapy' },
      { name: 'nutrition', route: 'allied-health/nutrition' },
      { name: 'social-work', route: 'allied-health/social-work' },
    ],
  },
  {
    name: 'laboratory',
    controllers: [
      { name: 'lab-requests', route: 'laboratory/requests' },
      { name: 'lab-results', route: 'laboratory/results' },
      { name: 'lab-samples', route: 'laboratory/samples' },
    ],
  },
  {
    name: 'radiology',
    controllers: [
      { name: 'radiology', route: 'radiology' },
      { name: 'imaging', route: 'radiology/imaging' },
      { name: 'ecg', route: 'radiology/ecg' },
    ],
  },
  {
    name: 'pharmacy',
    controllers: [
      { name: 'pharmacy', route: 'pharmacy' },
      { name: 'dispensing', route: 'pharmacy/dispensing' },
      { name: 'pharmacy-inventory', route: 'pharmacy/inventory' },
    ],
  },
  {
    name: 'billing',
    controllers: [
      { name: 'billing', route: 'billing' },
      { name: 'invoices', route: 'billing/invoices' },
      { name: 'service-pricing', route: 'billing/service-pricing' },
    ],
  },
  {
    name: 'cashier',
    controllers: [
      { name: 'cashier', route: 'cashier' },
      { name: 'payments', route: 'cashier/payments' },
    ],
  },
  {
    name: 'finance',
    controllers: [
      { name: 'finance', route: 'finance' },
      { name: 'revenue', route: 'finance/revenue' },
      { name: 'claims', route: 'finance/claims' },
    ],
  },
  {
    name: 'insurance',
    controllers: [
      { name: 'nhia', route: 'insurance/nhia' },
      { name: 'hmo', route: 'insurance/hmo' },
      { name: 'claims', route: 'insurance/claims' },
    ],
  },
  {
    name: 'inventory',
    controllers: [
      { name: 'inventory', route: 'inventory' },
      { name: 'stock', route: 'inventory/stock' },
      { name: 'procurement', route: 'inventory/procurement' },
    ],
  },
  {
    name: 'governance',
    controllers: [
      { name: 'board', route: 'governance/board' },
      { name: 'cmd', route: 'governance/cmd' },
    ],
  },
  {
    name: 'hr',
    controllers: [
      { name: 'hr', route: 'hr' },
      { name: 'staff', route: 'hr/staff' },
      { name: 'students', route: 'hr/students' },
    ],
  },
];

for (const mod of multiControllerModules) {
  const dir = join(SRC, mod.name);
  const serviceClass = `${pascalCase(mod.name)}Service`;
  write(join(dir, `${mod.name}.service.ts`), serviceTemplate(serviceClass));
  write(join(dir, 'dto', '.gitkeep'), '');

  const controllerEntries = [];
  for (const ctrl of mod.controllers) {
    const ctrlClass = `${pascalCase(ctrl.name)}Controller`;
    write(
      join(dir, `${ctrl.name}.controller.ts`),
      controllerTemplate(ctrlClass, ctrl.route, `${mod.name}.service`, serviceClass),
    );
    controllerEntries.push({ class: ctrlClass, file: `${ctrl.name}.controller` });
  }

  write(
    join(dir, `${mod.name}.module.ts`),
    moduleTemplate(
      `${pascalCase(mod.name)}Module`,
      [],
      controllerEntries,
      [{ class: serviceClass, file: `${mod.name}.service` }],
    ),
  );
  createdModules.push(`${pascalCase(mod.name)}Module`);
}

createdModules.push('ClinicalModule');

// Reports
const reportsDir = join(SRC, 'reports');
write(join(reportsDir, 'reports.service.ts'), serviceTemplate('ReportsService'));
write(
  join(reportsDir, 'clinical-reports.service.ts'),
  serviceTemplate('ClinicalReportsService'),
);
write(
  join(reportsDir, 'financial-reports.service.ts'),
  serviceTemplate('FinancialReportsService'),
);
write(
  join(reportsDir, 'operational-reports.service.ts'),
  serviceTemplate('OperationalReportsService'),
);
write(
  join(reportsDir, 'reports.controller.ts'),
  controllerTemplate('ReportsController', 'reports', 'reports.service', 'ReportsService'),
);
write(join(reportsDir, 'dto', '.gitkeep'), '');
write(
  join(reportsDir, 'reports.module.ts'),
  `import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ClinicalReportsService } from './clinical-reports.service';
import { FinancialReportsService } from './financial-reports.service';
import { OperationalReportsService } from './operational-reports.service';

@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ClinicalReportsService,
    FinancialReportsService,
    OperationalReportsService,
  ],
  exports: [ReportsService, ClinicalReportsService, FinancialReportsService, OperationalReportsService],
})
export class ReportsModule {}
`,
);
createdModules.push('ReportsModule');

// Notifications
const notifDir = join(SRC, 'notifications');
write(join(notifDir, 'notifications.service.ts'), serviceTemplate('NotificationsService'));
write(join(notifDir, 'sms.service.ts'), serviceTemplate('SmsService'));
write(join(notifDir, 'email.service.ts'), serviceTemplate('EmailService'));
write(
  join(notifDir, 'notifications.controller.ts'),
  controllerTemplate(
    'NotificationsController',
    'notifications',
    'notifications.service',
    'NotificationsService',
  ),
);
write(join(notifDir, 'dto', '.gitkeep'), '');
write(
  join(notifDir, 'notifications.module.ts'),
  `import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SmsService } from './sms.service';
import { EmailService } from './email.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SmsService, EmailService],
  exports: [NotificationsService, SmsService, EmailService],
})
export class NotificationsModule {}
`,
);
createdModules.push('NotificationsModule');

// Files
const filesDir = join(SRC, 'files');
write(join(filesDir, 'files.service.ts'), serviceTemplate('FilesService'));
write(join(filesDir, 'storage.service.ts'), serviceTemplate('StorageService'));
write(
  join(filesDir, 'files.controller.ts'),
  controllerTemplate('FilesController', 'files', 'files.service', 'FilesService'),
);
write(
  join(filesDir, 'files.module.ts'),
  `import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, StorageService],
  exports: [FilesService, StorageService],
})
export class FilesModule {}
`,
);
createdModules.push('FilesModule');

// Realtime
const realtimeDir = join(SRC, 'realtime');
write(join(realtimeDir, 'realtime.service.ts'), serviceTemplate('RealtimeService'));
write(
  join(realtimeDir, 'realtime.gateway.ts'),
  `import { WebSocketGateway } from '@nestjs/websockets';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({ namespace: '/events' })
export class RealtimeGateway {
  constructor(private readonly realtimeService: RealtimeService) {}
}
`,
);
write(
  join(realtimeDir, 'realtime.module.ts'),
  `import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
`,
);
createdModules.push('RealtimeModule');

console.log(`Scaffolded ${createdModules.length} modules`);
