/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as admin_audit from "../admin/audit.js";
import type * as admin_doctors from "../admin/doctors.js";
import type * as admin_featureFlags from "../admin/featureFlags.js";
import type * as admin_invoices from "../admin/invoices.js";
import type * as admin_metrics from "../admin/metrics.js";
import type * as admin_prg from "../admin/prg.js";
import type * as admin_prgExpiration from "../admin/prgExpiration.js";
import type * as admin_seedDoctor from "../admin/seedDoctor.js";
import type * as admin_seedInvoice from "../admin/seedInvoice.js";
import type * as admin_subscriptions from "../admin/subscriptions.js";
import type * as ai_hermes from "../ai/hermes.js";
import type * as ai_hermesData from "../ai/hermesData.js";
import type * as ai_prompts from "../ai/prompts.js";
import type * as appointments_booking from "../appointments/booking.js";
import type * as appointments_jobs from "../appointments/jobs.js";
import type * as appointments_queries from "../appointments/queries.js";
import type * as audit from "../audit.js";
import type * as auth_nonceCleanup from "../auth/nonceCleanup.js";
import type * as auth_profiles from "../auth/profiles.js";
import type * as auth_walletNonce from "../auth/walletNonce.js";
import type * as auth_walletVerify from "../auth/walletVerify.js";
import type * as crons from "../crons.js";
import type * as discord_dmChannel from "../discord/dmChannel.js";
import type * as discord_handlers from "../discord/handlers.js";
import type * as discord_interactions from "../discord/interactions.js";
import type * as doctors_auditAccess from "../doctors/auditAccess.js";
import type * as doctors_consultations from "../doctors/consultations.js";
import type * as doctors_medicalAlerts from "../doctors/medicalAlerts.js";
import type * as doctors_queries from "../doctors/queries.js";
import type * as doctors_treatments from "../doctors/treatments.js";
import type * as http from "../http.js";
import type * as lib_featureFlags from "../lib/featureFlags.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_rbac from "../lib/rbac.js";
import type * as lib_unique from "../lib/unique.js";
import type * as lib_validation from "../lib/validation.js";
import type * as maintenance_alertOps from "../maintenance/alertOps.js";
import type * as maintenance_approveAllSeedSpecialists from "../maintenance/approveAllSeedSpecialists.js";
import type * as maintenance_auditRetention from "../maintenance/auditRetention.js";
import type * as maintenance_seedConfirmableAppointment from "../maintenance/seedConfirmableAppointment.js";
import type * as maintenance_seedEarnedPayout from "../maintenance/seedEarnedPayout.js";
import type * as maintenance_seedLateInvoice from "../maintenance/seedLateInvoice.js";
import type * as maintenance_seedPendingSpecialists from "../maintenance/seedPendingSpecialists.js";
import type * as maintenance_seedTestData from "../maintenance/seedTestData.js";
import type * as marketplace_reviews from "../marketplace/reviews.js";
import type * as marketplace_specialists from "../marketplace/specialists.js";
import type * as messages_conversations from "../messages/conversations.js";
import type * as messages_messages from "../messages/messages.js";
import type * as notifications_notifications from "../notifications/notifications.js";
import type * as patients_consents from "../patients/consents.js";
import type * as patients_healthDashboard from "../patients/healthDashboard.js";
import type * as patients_onboarding from "../patients/onboarding.js";
import type * as payments_derivation from "../payments/derivation.js";
import type * as payments_hdwallet from "../payments/hdwallet.js";
import type * as payments_invoices from "../payments/invoices.js";
import type * as payments_monitor from "../payments/monitor.js";
import type * as payments_onChain from "../payments/onChain.js";
import type * as payments_payouts from "../payments/payouts.js";
import type * as payments_reconciliation from "../payments/reconciliation.js";
import type * as seed from "../seed.js";
import type * as wa_inbound from "../wa/inbound.js";
import type * as wa_send from "../wa/send.js";
import type * as wa_templates from "../wa/templates.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "admin/audit": typeof admin_audit;
  "admin/doctors": typeof admin_doctors;
  "admin/featureFlags": typeof admin_featureFlags;
  "admin/invoices": typeof admin_invoices;
  "admin/metrics": typeof admin_metrics;
  "admin/prg": typeof admin_prg;
  "admin/prgExpiration": typeof admin_prgExpiration;
  "admin/seedDoctor": typeof admin_seedDoctor;
  "admin/seedInvoice": typeof admin_seedInvoice;
  "admin/subscriptions": typeof admin_subscriptions;
  "ai/hermes": typeof ai_hermes;
  "ai/hermesData": typeof ai_hermesData;
  "ai/prompts": typeof ai_prompts;
  "appointments/booking": typeof appointments_booking;
  "appointments/jobs": typeof appointments_jobs;
  "appointments/queries": typeof appointments_queries;
  audit: typeof audit;
  "auth/nonceCleanup": typeof auth_nonceCleanup;
  "auth/profiles": typeof auth_profiles;
  "auth/walletNonce": typeof auth_walletNonce;
  "auth/walletVerify": typeof auth_walletVerify;
  crons: typeof crons;
  "discord/dmChannel": typeof discord_dmChannel;
  "discord/handlers": typeof discord_handlers;
  "discord/interactions": typeof discord_interactions;
  "doctors/auditAccess": typeof doctors_auditAccess;
  "doctors/consultations": typeof doctors_consultations;
  "doctors/medicalAlerts": typeof doctors_medicalAlerts;
  "doctors/queries": typeof doctors_queries;
  "doctors/treatments": typeof doctors_treatments;
  http: typeof http;
  "lib/featureFlags": typeof lib_featureFlags;
  "lib/money": typeof lib_money;
  "lib/rbac": typeof lib_rbac;
  "lib/unique": typeof lib_unique;
  "lib/validation": typeof lib_validation;
  "maintenance/alertOps": typeof maintenance_alertOps;
  "maintenance/approveAllSeedSpecialists": typeof maintenance_approveAllSeedSpecialists;
  "maintenance/auditRetention": typeof maintenance_auditRetention;
  "maintenance/seedConfirmableAppointment": typeof maintenance_seedConfirmableAppointment;
  "maintenance/seedEarnedPayout": typeof maintenance_seedEarnedPayout;
  "maintenance/seedLateInvoice": typeof maintenance_seedLateInvoice;
  "maintenance/seedPendingSpecialists": typeof maintenance_seedPendingSpecialists;
  "maintenance/seedTestData": typeof maintenance_seedTestData;
  "marketplace/reviews": typeof marketplace_reviews;
  "marketplace/specialists": typeof marketplace_specialists;
  "messages/conversations": typeof messages_conversations;
  "messages/messages": typeof messages_messages;
  "notifications/notifications": typeof notifications_notifications;
  "patients/consents": typeof patients_consents;
  "patients/healthDashboard": typeof patients_healthDashboard;
  "patients/onboarding": typeof patients_onboarding;
  "payments/derivation": typeof payments_derivation;
  "payments/hdwallet": typeof payments_hdwallet;
  "payments/invoices": typeof payments_invoices;
  "payments/monitor": typeof payments_monitor;
  "payments/onChain": typeof payments_onChain;
  "payments/payouts": typeof payments_payouts;
  "payments/reconciliation": typeof payments_reconciliation;
  seed: typeof seed;
  "wa/inbound": typeof wa_inbound;
  "wa/send": typeof wa_send;
  "wa/templates": typeof wa_templates;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
