const { createClient } = require("@supabase/supabase-js");

function required() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_KEY are required."
    );
  }

  return createClient(url, key);
}

async function createTicket(data) {
  const { data: row, error } = await required()
    .from("tickets")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return row;
}

async function updateTicket(ticket_id, patch) {
  const { data, error } = await required()
    .from("tickets")
    .update(patch)
    .eq("ticket_id", ticket_id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getTicketById(ticket_id) {
  const { data, error } = await required()
    .from("tickets")
    .select("*")
    .eq("ticket_id", ticket_id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getOpenTicket(guild_id, user_id, type) {
  const { data, error } = await required()
    .from("tickets")
    .select("*")
    .eq("guild_id", guild_id)
    .eq("user_id", user_id)
    .eq("type", type)
    .not("status", "in", "(closed,rejected,accepted)");

  if (error) throw error;
  return data?.[0] || null;
}

async function createApplication(data) {
  const { data: row, error } = await required()
    .from("applications")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return row;
}

async function updateApplication(user_id, patch) {
  const { data, error } = await required()
    .from("applications")
    .update(patch)
    .eq("user_id", user_id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  createTicket,
  updateTicket,
  getTicketById,
  getOpenTicket,
  createApplication,
  updateApplication
};
