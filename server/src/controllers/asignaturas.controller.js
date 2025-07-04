import { pool } from '../db.js';

export const get_all_subjects = async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM asignaturas where activo = true');
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error al obtener asignaturas:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

export const add_subject = async (req, res) => {
  const { codigo, nombre, semestre, descripcion, laboratorio, controles, proyecto, electivo } = req.body || {};

  const Asignatura_existe = await pool.query(
    'SELECT * FROM asignaturas WHERE codigo = $1',
    [codigo]
  );

  if (Asignatura_existe.rows.length > 0) {
    return res.status(400).json({
      message: 'La asignatura ya fue creada anteriormente',
    });
  }

  const Nuevo_Ramo = await pool.query(
    'INSERT INTO asignaturas (codigo, nombre, semestre, descripcion, laboratorio, controles, proyecto, electivo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
    [codigo, nombre, semestre, descripcion, laboratorio, controles, proyecto, electivo]
  );

  const { id } = Nuevo_Ramo.rows[0];

  if (Nuevo_Ramo.rowCount === 0) {
    return res.status(400).json({
      message: 'Error al crear el ramo',
    });
  }

  res.status(201).json({
    message: 'Ramo creado correctamente',
    ramo: { id, codigo, nombre, semestre, descripcion, laboratorio, controles, proyecto, electivo },
  });
};

export const modify_subject = async (req, res) => {
  const { id } = req.params;
  const { codigo, nombre, semestre, descripcion, laboratorio, controles, proyecto, electivo } = req.body || {};

  const asignaturaQuery = await pool.query('SELECT * FROM asignaturas WHERE codigo = $1 AND id != $2', [codigo, id]);
  if (asignaturaQuery.rows.length > 0) return res.status(400).json({ error: 'Ya existe una asignatura con ese código.' });

  const datos_a_cambiar = { codigo, nombre, semestre, descripcion, laboratorio, controles, proyecto, electivo };
  const campo_con_datos = [];
  const Valores = [];
  let posicion = 1;

  for (const llave in datos_a_cambiar) {
    if (datos_a_cambiar[llave] !== undefined) {
      campo_con_datos.push(`${llave} = $${posicion}`);
      Valores.push(datos_a_cambiar[llave]);
      posicion++;
    }
  }

  Valores.push(id);

  const query = `UPDATE asignaturas SET ${campo_con_datos.join(', ')} WHERE id = $${posicion} RETURNING *`;

  try {
    const resultado = await pool.query(query, Valores);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ error: 'Asignatura no encontrada.' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error al actualizar asignatura:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

export const search_subject = async (req, res) => {
  const { busqueda } = req.query || {};

  try {
    const resultado = await pool.query(
      `SELECT codigo, nombre 
       FROM asignaturas
       WHERE unaccent(codigo) ILIKE unaccent($1)
       OR unaccent(nombre) ILIKE unaccent($1)`,
      [`%${busqueda}%`]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error al buscar asignatura:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

export const subject_all = async (req, res) => {
  const { codigo } = req.params;
  try {
    const asignaturaQuery = await pool.query(
      `SELECT id, activo, codigo, descripcion, nombre, n_encuestas, laboratorio, controles, proyecto, electivo
       FROM asignaturas WHERE codigo = $1`,
      [codigo]
    );

    
    if (asignaturaQuery.rows.length === 0)
      return res.status(404).json({ ok: false, message: "Asignatura no encontrada bajo tal código" });
    
    if(!asignaturaQuery.rows[0].activo) return res.status(400).json({ ok: false, message: "Asignatura no activa" });
    
    const asignatura = asignaturaQuery.rows[0];
    const id_asignatura = asignatura.id;

    const comentariosQuery = await pool.query( //* faltaba u.activo, no se mandaba *//
      `SELECT u.id as id_usuario, u.nombre, u.apellido, u.activo, c.id, c.fecha, c.reputacion, c.texto, c.likes_usuarios
       FROM comentarios AS c
       JOIN usuarios AS u ON c.id_usuario = u.id
       WHERE c.id_asignatura = $1
       AND c.activo = true`,
      [id_asignatura]
    );
    asignatura.comentarios = comentariosQuery.rows;

    const preguntasQuery = await pool.query(`
      SELECT p.id, p.pregunta
      FROM encuestas e
      JOIN preguntas p ON e.id_tipo_pregunta = p.id_tipo_pregunta
      WHERE e.id_asignatura = $1
    `, [id_asignatura]);

    const respuestasPonderadasQuery = await pool.query(`
      select *
      from respuestas_ponderadas
      where id_asignatura = $1
    `, [id_asignatura]);
    if (respuestasPonderadasQuery.rowCount === 0) {
      respuestasPonderadasQuery.rows = [];
    }
    /*
CREATE TABLE evaluacion (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  id_pregunta uuid NOT NULL,
  id_asignatura uuid NOT NULL,
  id_usuario uuid NOT NULL,
  respuesta int NOT NULL

    */

    const cantidad_respuestas_query = await pool.query(`
      SELECT COUNT(DISTINCT id_usuario) as cantidad
      FROM evaluacion
      WHERE id_asignatura = $1
    `, [id_asignatura]);

    asignatura.cantidad_respuestas = cantidad_respuestas_query.rows[0].cantidad;
    console.log(cantidad_respuestas_query.rows)
    asignatura.respuestasPonderadas = respuestasPonderadasQuery.rows;

    return res.status(200).json({
      ok: true,
      asignatura,
      preguntas: preguntasQuery.rows
    });
  } catch (error) {
    console.error('Error al buscar asignatura:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

export const soft_delete_subject = async (req, res) => {
  const { id } = req.params;

  try {

    const asignaturaQuery = await pool.query('SELECT * FROM asignaturas WHERE id = $1', [id]);

    if (asignaturaQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Asignatura no encontrada.' });
    }
    
    if( !asignaturaQuery.rows[0].activo ) {
      return res.status(400).json({ error: 'La asignatura ya está desactivada.' });
    }

    const resultado = await pool.query('UPDATE asignaturas SET activo=false WHERE id = $1 RETURNING *', [id]);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ error: 'Asignatura no encontrada.' });
    }

    res.json({ message: 'Asignatura desactivada correctamente.', asignatura: resultado.rows[0] });
  } catch (error) {
    console.error('Error al desactivar asignatura:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};
