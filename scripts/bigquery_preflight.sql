SELECT user_id, is_user_message, event_timestamp, message_id,
       message_text, message_type, message_raw
FROM `yalo-eval-wa.yalo_data_sharing___alkosto_co.vw_messages`
WHERE event_date >= DATE '2026-08-31'
  AND event_date < DATE '2026-09-01'
  AND event_timestamp >= TIMESTAMP '2026-08-31 05:00:00+00'
  AND event_timestamp < TIMESTAMP '2026-08-31 06:00:00+00'
LIMIT 20001
