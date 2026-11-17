-- History rows for list (stages, departments, job titles) and penalty-catalogue edits (T4).
ALTER TYPE "SettingScope" ADD VALUE IF NOT EXISTS 'LISTS';
ALTER TYPE "SettingScope" ADD VALUE IF NOT EXISTS 'CATALOGUE';
