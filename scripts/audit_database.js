#!/usr/bin/env node

/**
 * Database Audit Script - MedConnect
 *
 * Executes comprehensive audit queries to verify:
 * 1. Clinic count vs. Excel SON vs. marketplace target (2,961)
 * 2. Specialty and procedure coverage per clinic
 * 3. Doctoralia schedule import completeness
 */

import { query, sql } from '../src/lib/db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color codes for console output
const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  bold: '\x1b[1m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${COLORS.reset}`);
}

async function runAudit() {
  try {
    log(COLORS.bold + COLORS.cyan, '\n=== MEDCONNECT DATABASE AUDIT ===\n');

    // AUDIT 1: Clinic Counts
    log(COLORS.cyan, '📊 AUDIT 1: CLINIC COUNTS');
    log(COLORS.reset, '----------------------------');

    const clinicCount = await query('SELECT COUNT(*) as total FROM clinics');
    const total = clinicCount.recordset[0].total;
    log(COLORS.green, `✓ Total clinics in BD: ${total}`);

    const clinicsWithDoctoralia = await query(
      'SELECT COUNT(DISTINCT clinic_id) as count FROM clinic_schedules WHERE source = @source',
      { source: { type: sql.NVarChar(50), value: 'doctoralia' } }
    );
    const withDoctoralia = clinicsWithDoctoralia.recordset[0].count;
    log(COLORS.green, `✓ Clinics with Doctoralia schedules: ${withDoctoralia}`);
    log(COLORS.yellow, `  Coverage: ${((withDoctoralia / total) * 100).toFixed(2)}%`);

    const clinicsWithoutDoctoralia = total - withDoctoralia;
    log(COLORS.yellow, `  Without Doctoralia: ${clinicsWithoutDoctoralia}`);

    const recentUpdates = await query(
      "SELECT COUNT(*) as count FROM clinics WHERE updated_at > @date",
      { date: { type: sql.DateTime2, value: new Date('2026-04-15') } }
    );
    log(COLORS.green, `✓ Clinics updated after 2026-04-15: ${recentUpdates.recordset[0].count}`);

    log(COLORS.yellow, `\n⚠️  Target (marketplace 2,961): ${total > 2961 ? `OVER by ${total - 2961}` : `SHORT by ${2961 - total}`}`);

    // AUDIT 2: Specialties and Procedures
    log(COLORS.cyan, '\n📊 AUDIT 2: SPECIALTIES & PROCEDURES');
    log(COLORS.reset, '----------------------------');

    const specialties = await query('SELECT COUNT(*) as total FROM clinic_specialties');
    log(COLORS.green, `✓ Total specialty records: ${specialties.recordset[0].total}`);

    const uniqueSpecialties = await query('SELECT COUNT(DISTINCT specialty_slug) as count FROM clinic_specialties');
    log(COLORS.green, `✓ Unique specialties: ${uniqueSpecialties.recordset[0].count}`);

    const procedures = await query('SELECT COUNT(*) as total FROM clinic_procedures');
    log(COLORS.green, `✓ Total procedure records: ${procedures.recordset[0].total}`);

    const uniqueProcedures = await query('SELECT COUNT(DISTINCT procedure_slug) as count FROM clinic_procedures');
    log(COLORS.green, `✓ Unique procedures: ${uniqueProcedures.recordset[0].count}`);

    const clinicsWithSpecialties = await query(
      'SELECT COUNT(DISTINCT clinic_id) as count FROM clinic_specialties'
    );
    const clinicsWithProcedures = await query(
      'SELECT COUNT(DISTINCT clinic_id) as count FROM clinic_procedures'
    );

    log(COLORS.green, `✓ Clinics with specialties: ${clinicsWithSpecialties.recordset[0].count}`);
    log(COLORS.green, `✓ Clinics with procedures: ${clinicsWithProcedures.recordset[0].count}`);

    const clinicsWithoutSpecialties = total - clinicsWithSpecialties.recordset[0].count;
    const clinicsWithoutProcedures = total - clinicsWithProcedures.recordset[0].count;

    if (clinicsWithoutSpecialties > 0) {
      log(COLORS.red, `✗ Clinics WITHOUT specialties: ${clinicsWithoutSpecialties}`);
    }
    if (clinicsWithoutProcedures > 0) {
      log(COLORS.red, `✗ Clinics WITHOUT procedures: ${clinicsWithoutProcedures}`);
    }

    // AUDIT 3: Doctoralia Coverage Details
    log(COLORS.cyan, '\n📊 AUDIT 3: DOCTORALIA SCHEDULE COVERAGE');
    log(COLORS.reset, '----------------------------');

    const schedulesByDay = await query(`
      SELECT day_of_week, COUNT(DISTINCT clinic_id) as clinic_count, COUNT(*) as schedule_records
      FROM clinic_schedules
      WHERE source = 'doctoralia'
      GROUP BY day_of_week
      ORDER BY day_of_week
    `);

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    schedulesByDay.recordset.forEach((row) => {
      log(COLORS.green, `✓ ${dayNames[row.day_of_week]}: ${row.clinic_count} clinics, ${row.schedule_records} schedule records`);
    });

    const clinicsWithAllWeekdays = await query(`
      SELECT clinic_id, COUNT(DISTINCT day_of_week) as days_covered
      FROM clinic_schedules
      WHERE source = 'doctoralia' AND day_of_week < 5
      GROUP BY clinic_id
      HAVING COUNT(DISTINCT day_of_week) = 5
    `);
    log(COLORS.yellow, `ℹ️  Clinics with all weekdays (Mon-Fri): ${clinicsWithAllWeekdays.recordset.length}`);

    // AUDIT 4: Schedule Validity
    log(COLORS.cyan, '\n📊 AUDIT 4: SCHEDULE VALIDITY');
    log(COLORS.reset, '----------------------------');

    const validSchedules = await query(`
      SELECT COUNT(*) as total
      FROM clinic_schedules
      WHERE source = 'doctoralia'
        AND start_time IS NOT NULL
        AND end_time IS NOT NULL
        AND start_time NOT LIKE '%[^0-9:]%'
        AND end_time NOT LIKE '%[^0-9:]%'
    `);
    log(COLORS.green, `✓ Valid schedules (HH:MM format): ${validSchedules.recordset[0].total}`);

    const invalidSchedules = await query(`
      SELECT COUNT(*) as total
      FROM clinic_schedules
      WHERE source = 'doctoralia'
        AND (start_time IS NULL OR end_time IS NULL OR start_time = '' OR end_time = '')
    `);
    const invalid = invalidSchedules.recordset[0].total;
    if (invalid > 0) {
      log(COLORS.red, `✗ Invalid schedules (NULL or empty): ${invalid}`);
    } else {
      log(COLORS.green, `✓ No invalid schedules found`);
    }

    // AUDIT 5: Distribution Summary
    log(COLORS.cyan, '\n📊 AUDIT 5: SUMMARY & RECOMMENDATIONS');
    log(COLORS.reset, '----------------------------');

    const avgSpecialtiesPerClinic = (specialties.recordset[0].total / clinicsWithSpecialties.recordset[0].count).toFixed(2);
    const avgProceduresPerClinic = (procedures.recordset[0].total / clinicsWithProcedures.recordset[0].count).toFixed(2);

    log(COLORS.green, `✓ Avg specialties per clinic: ${avgSpecialtiesPerClinic}`);
    log(COLORS.green, `✓ Avg procedures per clinic: ${avgProceduresPerClinic}`);

    log(COLORS.bold + COLORS.yellow, '\n📋 ACTION ITEMS:');
    if (clinicsWithoutDoctoralia > 0) {
      log(COLORS.yellow, `  1. ${clinicsWithoutDoctoralia} clinics missing Doctoralia data`);
      log(COLORS.yellow, `     → Will use fallback: 2-4 slots/week, next 5 business days`);
    }
    if (clinicsWithoutSpecialties > 0) {
      log(COLORS.yellow, `  2. ${clinicsWithoutSpecialties} clinics missing specialties`);
      log(COLORS.yellow, `     → Check import_catalog_b2c.py or manual import`);
    }
    if (clinicsWithoutProcedures > 0) {
      log(COLORS.yellow, `  3. ${clinicsWithoutProcedures} clinics missing procedures`);
      log(COLORS.yellow, `     → Check import_catalog_b2c.py or manual import`);
    }

    log(COLORS.bold + COLORS.green, '\n✅ AUDIT COMPLETE\n');

    process.exit(0);
  } catch (err) {
    log(COLORS.red, `\n❌ ERROR: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

runAudit();
