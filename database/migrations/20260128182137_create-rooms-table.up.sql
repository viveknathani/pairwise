create table if not exists rooms (
  id varchar primary key,
  data jsonb,
  created_at timestamp with time zone,
  expires_at timestamp with time zone 
);