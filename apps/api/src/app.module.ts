import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from './prisma/prisma.module'
import { AuditModule } from './audit/audit.module'
import { MailerModule } from './mailer/mailer.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { CustomersModule } from './customers/customers.module'
import { TagsModule } from './tags/tags.module'
import { ContactsModule } from './contacts/contacts.module'
import { ProductsModule } from './products/products.module'
import { LeadsModule } from './leads/leads.module'
import { OpportunitiesModule } from './opportunities/opportunities.module'
import { ActivitiesModule } from './activities/activities.module'
import { QuotationsModule } from './quotations/quotations.module'
import { DocumentsModule } from './documents/documents.module'
import { ContractsModule } from './contracts/contracts.module'
import { CompetitorsModule } from './competitors/competitors.module'
import { SearchModule } from './search/search.module'
import { NotificationsModule } from './notifications/notifications.module'
import { AiModule } from './ai/ai.module'
import { DashboardsModule } from './dashboards/dashboards.module'
import { ReportsModule } from './reports/reports.module'
import { InboxModule } from './inbox/inbox.module'
import { IntegrationsModule } from './integrations/integrations.module'
import { FlowaccountModule } from './integrations/flowaccount/flowaccount.module'
import { HealthController } from './health.controller'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: Number(process.env.THROTTLE_DEFAULT_LIMIT ?? 1000) },
      { name: 'auth', ttl: 60_000, limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 20) },
    ]),
    PrismaModule,
    AuditModule,
    MailerModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    TagsModule,
    ContactsModule,
    ProductsModule,
    LeadsModule,
    OpportunitiesModule,
    ActivitiesModule,
    QuotationsModule,
    DocumentsModule,
    ContractsModule,
    CompetitorsModule,
    SearchModule,
    NotificationsModule,
    AiModule,
    DashboardsModule,
    ReportsModule,
    InboxModule,
    IntegrationsModule,
    FlowaccountModule,
  ],
  controllers: [HealthController],
  providers: process.env.THROTTLE_DISABLE === '1' ? [] : [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
