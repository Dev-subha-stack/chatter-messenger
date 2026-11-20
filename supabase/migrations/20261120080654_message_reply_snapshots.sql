-- Preserve the original message text and sender for every reply.
create or replace function public.fill_message_reply_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  original_message public.messages%rowtype;
begin
  if new.reply_to_message_id is null then
    new.reply_to_sender_id := null;
    new.reply_to_content := null;
    return new;
  end if;

  select *
    into original_message
    from public.messages
   where id = new.reply_to_message_id
     and conversation_id = new.conversation_id;

  if found then
    new.reply_to_sender_id := original_message.sender_id;
    new.reply_to_content := case
      when original_message.deleted_at is not null then 'This message was deleted'
      else coalesce(
        nullif(btrim(original_message.content), ''),
        nullif(btrim(original_message.attachment_name), ''),
        case
          when original_message.attachment_type like 'image/%' then 'Photo'
          when original_message.attachment_type like 'video/%' then 'Video'
          when original_message.poll_id is not null then '📊 Poll'
          else 'Attachment'
        end
      )
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.fill_message_reply_snapshot() from public, anon, authenticated;
drop trigger if exists fill_message_reply_snapshot_before_insert on public.messages;
create trigger fill_message_reply_snapshot_before_insert
before insert on public.messages
for each row execute function public.fill_message_reply_snapshot();

-- Repair older reply rows whose quoted sender/text was never saved.
update public.messages as reply
   set reply_to_sender_id = original.sender_id,
       reply_to_content = case
         when original.deleted_at is not null then 'This message was deleted'
         else coalesce(
           nullif(btrim(original.content), ''),
           nullif(btrim(original.attachment_name), ''),
           case
             when original.attachment_type like 'image/%' then 'Photo'
             when original.attachment_type like 'video/%' then 'Video'
             when original.poll_id is not null then '📊 Poll'
             else 'Attachment'
           end
         )
       end
  from public.messages as original
 where reply.reply_to_message_id = original.id
   and reply.conversation_id = original.conversation_id
   and (reply.reply_to_content is null or btrim(reply.reply_to_content) = ''
        or reply.reply_to_sender_id is null);
