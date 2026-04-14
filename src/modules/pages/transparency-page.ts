/**
 * @file src/modules/pages/transparency-page.ts
 * @description صفحة الشفافية العامة - Public Transparency Dashboard
 * @module pages/transparency-page
 *
 * MVC View for /transparency — all user-facing strings route through i18n.
 * The page fetches data from /api/transparency on the client-side and
 * renders a full glassmorphic financial dashboard with:
 *   - Accounting equation verification badge
 *   - KPI summary cards
 *   - Daily trend mini-bar chart
 *   - Financial log feed table
 *   - Donations ledger table
 *   - Payroll aggregate table
 *   - Anonymized admin interventions feed
 *   - Top donors hall of fame
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

/** Transparency Page Handler */
export const transparencyPage = async (
    c: Context<{ Bindings: Bindings; Variables: Variables }>
) => {
    const lang = c.get('lang') as Language;
    const tr   = translations[getUILanguage(lang)];
    const rtl  = checkRTL(lang);
    const t    = (tr as any).transparency ?? {};

    // Serialize translations for client-side use
    const trJson = JSON.stringify(tr);

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}

        <div class="flex-1 bg-gray-50 dark:bg-[#080812]">

            <!-- ═══════════════════════════════════════ -->
            <!-- HERO SECTION                           -->
            <!-- ═══════════════════════════════════════ -->
            <div class="relative overflow-hidden">
                <!-- Gradient background -->
                <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 opacity-95"></div>
                <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.3),transparent_60%)]"></div>
                <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.15),transparent_60%)]"></div>

                <div class="relative container mx-auto px-4 py-16 max-w-6xl">
                    <!-- Badge -->
                    <div class="flex justify-center mb-6">
                        <span id="audit-badge" class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 backdrop-blur-sm">
                            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            ${t.hero_badge ?? 'Open-Book Policy'}
                        </span>
                    </div>

                    <!-- Title -->
                    <h1 class="text-center text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
                        <i class="fas fa-balance-scale ${rtl ? 'ml-3' : 'mr-3'} text-purple-400"></i>
                        ${t.page_title ?? 'Transparency Ledger'}
                    </h1>
                    <p class="text-center text-lg text-gray-300 max-w-2xl mx-auto mb-10">
                        ${t.page_subtitle ?? 'An open-book view of every dollar that flows through Dueli.'}
                    </p>

                    <!-- Audit Status Banner -->
                    <div id="audit-status" class="max-w-xl mx-auto flex items-center justify-center gap-3 bg-white/5 backdrop-blur rounded-xl px-6 py-3 border border-white/10">
                        <i class="fas fa-spinner fa-spin text-purple-300"></i>
                        <span class="text-gray-300 text-sm">${tr.loading ?? 'Loading...'}</span>
                    </div>
                </div>
            </div>

            <!-- ═══════════════════════════════════════ -->
            <!-- MAIN DASHBOARD                         -->
            <!-- ═══════════════════════════════════════ -->
            <div class="container mx-auto px-4 py-10 max-w-6xl space-y-10">

                <!-- KPI CARDS GRID -->
                <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4" id="kpi-grid">
                    ${renderKpiCardSkeleton(6)}
                </div>

                <!-- ACCOUNTING EQUATION SECTION -->
                <div class="bg-white dark:bg-[#111125] rounded-2xl shadow-xl border border-purple-100 dark:border-purple-900/30 p-6">
                    <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                        <i class="fas fa-function text-purple-500"></i>
                        ${t.section_equation ?? 'Accounting Equation'}
                    </h2>
                    <div id="equation-block" class="overflow-x-auto">
                        <div class="flex flex-wrap items-center justify-center gap-3 text-lg font-bold min-w-max mx-auto">
                            <div class="flex flex-col items-center gap-1">
                                <span class="text-xs text-gray-500 uppercase tracking-wider">${t.eq_ad_revenue ?? 'Ad Revenue'}</span>
                                <span id="eq-revenue" class="text-2xl text-emerald-500">$0.00</span>
                            </div>
                            <span class="text-2xl text-gray-400">${t.eq_minus ?? '−'}</span>
                            <div class="flex flex-col items-center gap-1">
                                <span class="text-xs text-gray-500 uppercase tracking-wider">${t.eq_operating_costs ?? 'Operating Costs'}</span>
                                <span id="eq-opex" class="text-2xl text-red-400">$0.00</span>
                            </div>
                            <span class="text-2xl text-gray-400">${t.eq_minus ?? '−'}</span>
                            <div class="flex flex-col items-center gap-1">
                                <span class="text-xs text-gray-500 uppercase tracking-wider">${t.eq_minus_donors ?? 'Donor Funding'}</span>
                                <span id="eq-donors" class="text-2xl text-blue-400">$0.00</span>
                            </div>
                            <span class="text-3xl font-black text-purple-400">${t.eq_equals ?? '='}</span>
                            <div class="flex flex-col items-center gap-1">
                                <span class="text-xs text-gray-500 uppercase tracking-wider">${t.eq_platform_net ?? 'Platform Net'}</span>
                                <span id="eq-net" class="text-2xl text-violet-400">$0.00</span>
                            </div>
                            <span class="text-2xl text-gray-400">${t.eq_plus ?? '+'}</span>
                            <div class="flex flex-col items-center gap-1">
                                <span class="text-xs text-gray-500 uppercase tracking-wider">${t.eq_competitor_payouts ?? 'Competitor Payouts'}</span>
                                <span id="eq-payouts" class="text-2xl text-amber-400">$0.00</span>
                            </div>
                        </div>
                        <p id="eq-lhs-rhs" class="text-center text-xs text-gray-400 mt-4"></p>
                    </div>
                </div>

                <!-- DAILY TREND CHART (CSS bar chart) -->
                <div class="bg-white dark:bg-[#111125] rounded-2xl shadow-xl border border-purple-100 dark:border-purple-900/30 p-6">
                    <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                        <i class="fas fa-chart-bar text-indigo-500"></i>
                        ${t.section_daily ?? 'Daily Financial Trend'}
                    </h2>
                    <div id="daily-chart" class="flex items-end gap-1 h-32 overflow-x-auto pb-2">
                        <!-- Bars rendered by JS -->
                    </div>
                    <div class="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
                        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-emerald-500 inline-block"></span>${t.eq_ad_revenue ?? 'Ad Revenue'}</span>
                        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-amber-400 inline-block"></span>${t.kpi_competitors_paid ?? 'Competitors Paid'}</span>
                        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-red-400 inline-block"></span>${t.kpi_operating_costs ?? 'Operating Costs'}</span>
                    </div>
                </div>

                <!-- TWO-COLUMN ROW: Payroll + Top Donors -->
                <div class="grid md:grid-cols-2 gap-6">

                    <!-- PAYROLL SECTION -->
                    <div class="bg-white dark:bg-[#111125] rounded-2xl shadow-xl border border-purple-100 dark:border-purple-900/30 p-6">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                            <i class="fas fa-users text-rose-400"></i>
                            ${t.section_payroll ?? 'Payroll Breakdown'}
                        </h2>
                        <p class="text-xs text-gray-400 mb-4">${t.payroll_note ?? 'Individual payroll details kept confidential.'}</p>
                        <div id="payroll-table" class="space-y-3">
                            <!-- Populated by JS -->
                        </div>
                    </div>

                    <!-- TOP DONORS -->
                    <div class="bg-white dark:bg-[#111125] rounded-2xl shadow-xl border border-purple-100 dark:border-purple-900/30 p-6">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                            <i class="fas fa-trophy text-amber-400"></i>
                            ${t.section_top_donors ?? 'Top Donors'}
                        </h2>
                        <div id="donors-list" class="space-y-3">
                            <!-- Populated by JS -->
                        </div>
                    </div>
                </div>

                <!-- FINANCIAL LOG FEED TABLE -->
                <div class="bg-white dark:bg-[#111125] rounded-2xl shadow-xl border border-purple-100 dark:border-purple-900/30 overflow-hidden">
                    <div class="p-6 pb-0">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                            <i class="fas fa-file-invoice-dollar text-green-500"></i>
                            ${t.section_financial_feed ?? 'Financial Log Feed'}
                        </h2>
                        <p class="text-xs text-gray-400 mb-4">${t.updated_live ?? 'Data updated live from ledger'}</p>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm" id="financial-table">
                            <thead class="bg-gray-50 dark:bg-[#0d0d20] text-xs text-gray-500 uppercase">
                                <tr>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_date ?? 'Date'}</th>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_type ?? 'Type'}</th>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_amount ?? 'Amount'}</th>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_description ?? 'Description'}</th>
                                </tr>
                            </thead>
                            <tbody id="financial-tbody" class="divide-y divide-gray-100 dark:divide-gray-800">
                                <tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">
                                    <i class="fas fa-spinner fa-spin"></i>
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="p-4 border-t border-gray-100 dark:border-gray-800">
                        <button id="load-more-financial" onclick="loadMoreFinancial()"
                            class="w-full py-2 text-sm text-purple-500 hover:text-purple-600 font-semibold transition-colors">
                            ${t.load_more ?? 'Load More'}
                        </button>
                    </div>
                </div>

                <!-- DONATIONS LEDGER TABLE -->
                <div class="bg-white dark:bg-[#111125] rounded-2xl shadow-xl border border-purple-100 dark:border-purple-900/30 overflow-hidden">
                    <div class="p-6 pb-0">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                            <i class="fas fa-hand-holding-heart text-pink-500"></i>
                            ${t.section_donation_feed ?? 'Donations Ledger'}
                        </h2>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 dark:bg-[#0d0d20] text-xs text-gray-500 uppercase">
                                <tr>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_date ?? 'Date'}</th>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_type ?? 'Type'}</th>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_donor ?? 'Donor'}</th>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_amount ?? 'Amount'}</th>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_description ?? 'Description'}</th>
                                </tr>
                            </thead>
                            <tbody id="donations-tbody" class="divide-y divide-gray-100 dark:divide-gray-800">
                                <tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">
                                    <i class="fas fa-spinner fa-spin"></i>
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- ADMIN INTERVENTIONS FEED -->
                <div class="bg-white dark:bg-[#111125] rounded-2xl shadow-xl border border-purple-100 dark:border-purple-900/30 overflow-hidden">
                    <div class="p-6 pb-0">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                            <i class="fas fa-shield-alt text-indigo-500"></i>
                            ${t.section_admin_log ?? 'Admin Interventions'}
                        </h2>
                        <p class="text-xs text-gray-400 mb-4">${t.admin_note ?? 'Admin identities are anonymized.'}</p>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 dark:bg-[#0d0d20] text-xs text-gray-500 uppercase">
                                <tr>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_date ?? 'Date'}</th>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_role ?? 'Role'}</th>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_action ?? 'Action'}</th>
                                    <th class="px-4 py-3 ${rtl ? 'text-right' : 'text-left'}">${t.th_target ?? 'Target'}</th>
                                </tr>
                            </thead>
                            <tbody id="admin-tbody" class="divide-y divide-gray-100 dark:divide-gray-800">
                                <tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">
                                    <i class="fas fa-spinner fa-spin"></i>
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Verified footer badge -->
                <div class="text-center py-4 text-xs text-gray-400 flex items-center justify-center gap-2">
                    <i class="fas fa-lock text-purple-400"></i>
                    ${t.verified_label ?? 'Verified Open-Book Platform'} — Dueli © ${new Date().getFullYear()}
                </div>

            </div><!-- /container -->
        </div>

        ${getFooter(lang)}

        <script>
        // ══════════════════════════════════════════════
        // Transparency Dashboard — Client-Side Script
        // ══════════════════════════════════════════════
        (function() {
            'use strict';

            const lang = '${lang}';
            const isRTL = ${rtl};
            const tr = ${trJson};
            const t = tr.transparency || {};

            // ── State ──
            let financialOffset = 0;
            const PAGE_SIZE = 20;

            // ── Bootstrap ──
            document.addEventListener('DOMContentLoaded', () => {
                loadTransparencyData();
            });

            // ── Main data fetch ──
            async function loadTransparencyData() {
                try {
                    const res = await fetch('/api/transparency?lang=' + lang);
                    const json = await res.json();
                    if (!json.success) throw new Error(json.error?.message || 'API error');
                    const d = json.data;

                    renderAuditBadge(d.audit);
                    renderKPIs(d.today, d.totals, d.donation_stats);
                    renderEquation(d.audit);
                    renderDailyChart(d.daily_summaries);
                    renderPayroll(d.payroll_summary);
                    renderTopDonors(d.top_donors);
                    renderFinancialFeed(d.recent_financial_feed, false);
                    renderDonationFeed(d.recent_donation_feed);
                    renderAdminFeed(d.admin_interventions);
                    financialOffset = d.recent_financial_feed.length;
                } catch (e) {
                    console.error('[Transparency]', e);
                    document.getElementById('audit-status').innerHTML =
                        '<i class="fas fa-exclamation-triangle text-red-400"></i>' +
                        '<span class="text-red-400 text-sm">' + (tr.errors?.something_wrong || 'Error loading data') + '</span>';
                }
            }

            // ── Audit badge ──
            function renderAuditBadge(audit) {
                const el = document.getElementById('audit-status');
                const badge = document.getElementById('audit-badge');
                if (audit.is_balanced) {
                    el.innerHTML =
                        '<i class="fas fa-check-circle text-emerald-400 text-lg"></i>' +
                        '<span class="text-emerald-300 font-semibold">' + (t.audit_balanced || 'Ledger Balanced ✓') + '</span>' +
                        '<span class="text-gray-400 text-xs mx-2">|</span>' +
                        '<span class="text-gray-400 text-xs">' + (t.last_audit || 'Last Audit') + ': ' + new Date(audit.audited_at).toLocaleTimeString(lang) + '</span>';
                    badge.classList.remove('bg-red-500/20','text-red-300','border-red-500/40');
                    badge.classList.add('bg-emerald-500/20','text-emerald-300','border-emerald-500/40');
                } else {
                    el.innerHTML =
                        '<i class="fas fa-exclamation-triangle text-red-400 text-lg"></i>' +
                        '<span class="text-red-300 font-semibold">' + (t.audit_imbalanced || 'Discrepancy Detected ⚠') + '</span>' +
                        '<span class="text-gray-400 text-xs mx-2">|</span>' +
                        '<span class="text-gray-400 text-xs">' + (t.audit_discrepancy || 'Discrepancy') + ': $' + audit.discrepancy.toFixed(4) + '</span>';
                    badge.classList.remove('bg-emerald-500/20','text-emerald-300','border-emerald-500/40');
                    badge.classList.add('bg-red-500/20','text-red-300','border-red-500/40');
                }
            }

            // ── KPI grid ──
            function renderKPIs(today, totals, donStats) {
                const kpis = [
                    { label: t.kpi_total_revenue    || 'Total Ad Revenue',      value: fmt(totals.total_ad_revenue),          icon: 'fa-dollar-sign',     color: 'text-emerald-500' },
                    { label: t.kpi_platform_share   || 'Platform Share',         value: fmt(totals.total_platform_share),       icon: 'fa-building',        color: 'text-violet-500'  },
                    { label: t.kpi_competitors_paid || 'Competitors Paid',       value: fmt(totals.total_competitor_payouts),   icon: 'fa-medal',           color: 'text-amber-500'   },
                    { label: t.kpi_operating_costs  || 'Operating Costs',        value: fmt(totals.total_operating_costs),      icon: 'fa-server',          color: 'text-red-400'     },
                    { label: t.kpi_donations_in     || 'Donations Received',     value: fmt(donStats.total_received),           icon: 'fa-heart',           color: 'text-pink-500'    },
                    { label: t.kpi_net_platform     || 'Platform Net (Today)',   value: fmt(today.net_platform),               icon: 'fa-chart-line',      color: today.net_platform >= 0 ? 'text-emerald-400' : 'text-red-400' },
                ];
                document.getElementById('kpi-grid').innerHTML = kpis.map(k => \`
                    <div class="bg-white dark:bg-[#111125] rounded-xl p-4 shadow-lg border border-gray-100 dark:border-purple-900/20 hover:shadow-xl transition-shadow">
                        <div class="flex items-center gap-2 mb-2">
                            <i class="fas \${k.icon} \${k.color} text-lg"></i>
                        </div>
                        <p class="text-xs text-gray-500 leading-tight mb-1">\${k.label}</p>
                        <p class="text-xl font-black text-gray-900 dark:text-white">\${k.value}</p>
                    </div>
                \`).join('');
            }

            // ── Accounting equation ──
            function renderEquation(audit) {
                const b = audit.breakdown;
                document.getElementById('eq-revenue').textContent  = fmt(b.total_ad_revenue);
                document.getElementById('eq-opex').textContent     = fmt(b.total_operating_costs);
                document.getElementById('eq-donors').textContent   = fmt(b.total_donor_funding);
                document.getElementById('eq-net').textContent      = fmt(b.platform_net);
                document.getElementById('eq-payouts').textContent  = fmt(b.competitors_payouts);
                document.getElementById('eq-lhs-rhs').textContent  =
                    'LHS = $' + audit.lhs.toFixed(4) + '   |   RHS = $' + audit.rhs.toFixed(4) +
                    (audit.is_balanced ? '   ✓ Balanced' : '   ⚠ Δ $' + audit.discrepancy.toFixed(4));
            }

            // ── Daily chart (CSS bar chart) ──
            function renderDailyChart(summaries) {
                if (!summaries.length) {
                    document.getElementById('daily-chart').innerHTML = '<span class="text-gray-400 text-sm m-auto">' + (t.no_entries || 'No data') + '</span>';
                    return;
                }
                const maxRev = Math.max(...summaries.map(s => s.total_ad_revenue), 1);
                const recent = summaries.slice(0, 14).reverse();
                document.getElementById('daily-chart').innerHTML = recent.map(s => {
                    const revH  = Math.round((s.total_ad_revenue / maxRev) * 100);
                    const payH  = Math.round((s.total_competitor_payouts / maxRev) * 100);
                    const opH   = Math.round((s.total_operating_costs / maxRev) * 100);
                    const label = s.period_date.slice(5); // MM-DD
                    return \`
                        <div class="flex flex-col items-center gap-0.5 min-w-[36px] group cursor-default" title="\${s.period_date}: Rev \${fmt(s.total_ad_revenue)}">
                            <div class="flex items-end gap-0.5 h-24">
                                <div class="w-2 bg-emerald-500 rounded-t transition-all" style="height:\${revH}%;" title="Revenue"></div>
                                <div class="w-2 bg-amber-400 rounded-t transition-all" style="height:\${payH}%;" title="Payouts"></div>
                                <div class="w-2 bg-red-400 rounded-t transition-all" style="height:\${opH}%;" title="OpEx"></div>
                            </div>
                            <span class="text-[9px] text-gray-400 rotate-45 origin-left">\${label}</span>
                        </div>
                    \`;
                }).join('');
            }

            // ── Payroll table ──
            function renderPayroll(payroll) {
                const el = document.getElementById('payroll-table');
                if (!payroll.length) {
                    el.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">' + (t.no_entries || 'No entries') + '</p>';
                    return;
                }
                el.innerHTML = payroll.map(p => \`
                    <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-user-tie text-rose-400 text-sm"></i>
                            <span class="text-sm text-gray-700 dark:text-gray-300 capitalize">\${entryTypeLabel(p.entry_type)}</span>
                        </div>
                        <div class="text-right">
                            <span class="font-bold text-gray-900 dark:text-white">\${fmt(p.total)}</span>
                            <span class="text-xs text-gray-400 block">\${p.count} \${t.th_entries || 'entries'}</span>
                        </div>
                    </div>
                \`).join('');
            }

            // ── Top donors ──
            function renderTopDonors(donors) {
                const el = document.getElementById('donors-list');
                if (!donors.length) {
                    el.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">' + (t.no_entries || 'No entries') + '</p>';
                    return;
                }
                el.innerHTML = donors.map((d, i) => \`
                    <div class="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <span class="w-7 h-7 rounded-full \${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-gray-300' : i === 2 ? 'bg-amber-700' : 'bg-indigo-500/30'} flex items-center justify-center text-xs font-bold text-white shrink-0">\${i + 1}</span>
                        <span class="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-200">\${d.donor_display_name || t.anonymous_donor || 'Anonymous'}</span>
                        <span class="font-bold text-emerald-500">\${fmt(d.total_donated)}</span>
                    </div>
                \`).join('');
            }

            // ── Financial feed ──
            function renderFinancialFeed(entries, append) {
                const tbody = document.getElementById('financial-tbody');
                const html = entries.map(e => \`
                    <tr class="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">\${fmtDate(e.created_at)}</td>
                        <td class="px-4 py-3">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold \${entryTypeBadge(e.entry_type)}">\${entryTypeLabel(e.entry_type)}</span>
                        </td>
                        <td class="px-4 py-3 font-bold \${amountColor(e.entry_type)}">\${fmt(e.amount)}</td>
                        <td class="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">\${e.public_description || '—'}</td>
                    </tr>
                \`).join('');
                if (!entries.length && !append) {
                    tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400 text-sm">' + (t.no_entries || 'No entries yet') + '</td></tr>';
                } else if (append) {
                    tbody.innerHTML += html;
                } else {
                    tbody.innerHTML = html || '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400 text-sm">' + (t.no_entries || 'No entries yet') + '</td></tr>';
                }
            }

            // ── Donations feed ──
            function renderDonationFeed(entries) {
                const tbody = document.getElementById('donations-tbody');
                if (!entries.length) {
                    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400 text-sm">' + (t.no_entries || 'No entries yet') + '</td></tr>';
                    return;
                }
                tbody.innerHTML = entries.map(e => \`
                    <tr class="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">\${fmtDate(e.created_at)}</td>
                        <td class="px-4 py-3">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold \${e.ledger_type === 'donation_received' ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}">\${e.ledger_type === 'donation_received' ? (t.type_donation_received || 'Received') : (t.type_donation_allocated || 'Allocated')}</span>
                        </td>
                        <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">\${e.donor_display_name || t.anonymous_donor || 'Anonymous'}</td>
                        <td class="px-4 py-3 font-bold text-pink-500">\${fmt(e.amount)}</td>
                        <td class="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">\${e.public_description || e.donor_message || '—'}</td>
                    </tr>
                \`).join('');
            }

            // ── Admin interventions feed ──
            function renderAdminFeed(interventions) {
                const tbody = document.getElementById('admin-tbody');
                if (!interventions.length) {
                    tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400 text-sm">' + (t.no_entries || 'No entries yet') + '</td></tr>';
                    return;
                }
                tbody.innerHTML = interventions.map(a => \`
                    <tr class="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">\${fmtDate(a.created_at)}</td>
                        <td class="px-4 py-3">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">\${a.role_label}</span>
                        </td>
                        <td class="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 capitalize">\${(a.action_type || '').replace(/_/g,' ')}</td>
                        <td class="px-4 py-3 text-xs text-gray-500">\${a.target_entity ?? '—'} \${a.target_id != null ? '#' + a.target_id : ''}</td>
                    </tr>
                \`).join('');
            }

            // ── Load more financial entries ──
            window.loadMoreFinancial = async function() {
                financialOffset += PAGE_SIZE;
                try {
                    const res = await fetch('/api/transparency/feed?limit=' + PAGE_SIZE + '&offset=' + financialOffset);
                    const json = await res.json();
                    if (json.success) renderFinancialFeed(json.data.feed, true);
                } catch (e) {
                    console.error('[Transparency] Load more error:', e);
                }
            };

            // ── Helpers ──
            function fmt(v) {
                return '$' + (Number(v) || 0).toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }

            function fmtDate(iso) {
                try { return new Date(iso).toLocaleDateString(lang, { month: 'short', day: 'numeric', year: 'numeric' }); }
                catch { return iso?.slice(0, 10) ?? ''; }
            }

            function entryTypeLabel(type) {
                const map = {
                    ad_revenue:        t.type_ad_revenue        || 'Ad Revenue',
                    competitor_payout: t.type_competitor_payout || 'Competitor Payout',
                    platform_share:    t.type_platform_share    || 'Platform Share',
                    server_cost:       t.type_server_cost       || 'Server Cost',
                    developer_salary:  t.type_developer_salary  || 'Developer Salary',
                    admin_salary:      t.type_admin_salary       || 'Admin Salary',
                    donor_allocation:  t.type_donor_allocation   || 'Donor Allocation',
                    other_cost:        t.type_other_cost         || 'Other Cost',
                };
                return map[type] || type;
            }

            function entryTypeBadge(type) {
                if (type === 'ad_revenue')        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
                if (type === 'competitor_payout') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
                if (type === 'platform_share')    return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300';
                if (type === 'donor_allocation')  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
                return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
            }

            function amountColor(type) {
                if (type === 'ad_revenue')        return 'text-emerald-500';
                if (type === 'competitor_payout') return 'text-amber-500';
                if (type === 'platform_share')    return 'text-violet-500';
                return 'text-red-400';
            }
        })();
        </script>
    `;

    return c.html(generateHTML(content, lang, t.page_title ?? 'Transparency Ledger'));
};

/** Helper: generates skeleton KPI card placeholders */
function renderKpiCardSkeleton(count: number): string {
    return Array.from({ length: count }).map(() => `
        <div class="bg-white dark:bg-[#111125] rounded-xl p-4 shadow-lg border border-gray-100 dark:border-purple-900/20 animate-pulse">
            <div class="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded mb-3"></div>
            <div class="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
            <div class="h-6 w-16 bg-gray-300 dark:bg-gray-600 rounded"></div>
        </div>
    `).join('');
}

export default transparencyPage;
