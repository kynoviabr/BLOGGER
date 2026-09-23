-- 00003_add_autopilot_columns.sql
-- Adiciona colunas para suporte ao Módulo Autopilot (Piloto Automático por Blog)

ALTER TABLE blogs 
ADD COLUMN IF NOT EXISTS autopilot_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS autopilot_start_time VARCHAR(10) DEFAULT '06:00',
ADD COLUMN IF NOT EXISTS autopilot_interval_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS autopilot_daily_limit INTEGER DEFAULT 5;

COMMENT ON COLUMN blogs.autopilot_enabled IS 'Indica se a esteira autônoma de publicação está ativa para este blog';
COMMENT ON COLUMN blogs.autopilot_start_time IS 'Horário diário (HH:mm) a partir do qual as publicações automáticas podem ocorrer';
COMMENT ON COLUMN blogs.autopilot_interval_minutes IS 'Intervalo mínimo em minutos entre publicações automáticas';
COMMENT ON COLUMN blogs.autopilot_daily_limit IS 'Limite máximo de artigos publicados por dia pelo piloto automático';
